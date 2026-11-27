import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { fromBuffer } from 'yauzl';
import { imageCandidate, publicFields, type Business, type Candidate } from './model.ts';

export const maxDataFileSize = 25 * 1024 * 1024;
const maxRows = 25_000;
const maxColumns = 250;
const reserved = new Set(['__proto__', 'constructor', 'prototype', '_manual_fields']);

export const sourceFields = [
  'business_id', 'name', 'category', 'subcategory', 'destination', 'municipality', 'barangay', 'address',
  'latitude', 'longitude', 'phone', 'email', 'website', 'facebook', 'instagram', 'whatsapp', 'opening_hours',
  'services', 'amenities', 'description', 'logo_url', 'photo_url', 'image_permissions', 'source_url', 'source_id',
  'license', 'verification_date', 'confidence', 'operating_status', 'editorial_status', 'website_available',
  'mobile_responsive', 'has_online_booking', 'has_online_ordering', 'has_digital_payments', 'social_media_presence',
  'merqato_opportunity',
] as const;
const standardFields = new Set<string>([
  ...sourceFields, ...publicFields, 'original_source_url', 'image_url', 'url', 'filename',
  'relative_file_path', 'image_type', 'reuse_permission_status', 'permission_status', 'attribution',
]);

type Row = Record<string, unknown>;
type ImportData = { columns: string[]; rows: Row[]; rowNumbers?: number[] };
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

function jsonRows(name: string, bytes: Uint8Array): Row[] {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw Error('Use a valid UTF-8 JSON document.');
  }
  if (isRow(value) && value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    if (value.features.length > maxRows) throw Error(`Split imports into at most ${maxRows.toLocaleString()} rows.`);
    return value.features.map((feature, index) => {
      if (!isRow(feature) || feature.type !== 'Feature' || !(feature.properties === null || isRow(feature.properties))) {
        throw Error(`Feature ${index + 1} is not a valid GeoJSON feature.`);
      }
      const properties = { ...feature.properties };
      if (!properties.business_id && (typeof feature.id === 'string' || typeof feature.id === 'number')) {
        properties.business_id = String(feature.id);
      }
      if (feature.geometry === null) return properties;
      if (!isRow(feature.geometry) || feature.geometry.type !== 'Point' ||
          !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length < 2 ||
          !feature.geometry.coordinates.slice(0, 2).every(coordinate => typeof coordinate === 'number')) {
        throw Error(`Feature ${index + 1} needs a Point geometry with longitude and latitude, or a null geometry.`);
      }
      const [longitude, latitude] = feature.geometry.coordinates;
      return { ...properties, longitude, latitude };
    });
  }
  if (/\.geojson$/i.test(name)) throw Error('Use a GeoJSON FeatureCollection.');
  if (isRow(value)) value = value.businesses;
  if (!Array.isArray(value)) throw Error('Use a JSON array of records, a directory backup, or a GeoJSON FeatureCollection.');
  if (value.length > maxRows) throw Error(`Split imports into at most ${maxRows.toLocaleString()} rows.`);
  return value.map((row, index) => {
    if (!isRow(row)) throw Error(`Record ${index + 1} must be a JSON object.`);
    return row;
  });
}

function checkWorkbookSize(data: Buffer) {
  return new Promise<void>((resolve, reject) => {
    fromBuffer(data, { lazyEntries: true }, (error, archive) => {
      if (error || !archive) {
        reject(Error('Unable to open the XLSX workbook.'));
        return;
      }
      let unpacked = 0;
      const tooLarge = () => {
        archive.close();
        reject(Error('The workbook expands beyond the supported size. Use a smaller workbook.'));
      };
      if (archive.entryCount > 200) return tooLarge();
      archive.once('error', reject);
      archive.once('end', resolve);
      archive.on('entry', entry => {
        unpacked += entry.uncompressedSize;
        if (unpacked > 64 * 1024 * 1024) return tooLarge();
        archive.readEntry();
      });
      archive.readEntry();
    });
  });
}

function sheetRows(sheet: ExcelJS.Worksheet): ImportData {
  if (sheet.columnCount > maxColumns || sheet.rowCount > maxRows + 1) {
    throw Error(`Use at most ${maxColumns} columns and ${maxRows.toLocaleString()} data rows.`);
  }
  const columns = Array.from({ length: sheet.columnCount }, (_, index) => sheet.getRow(1).getCell(index + 1).text.trim());
  const headers = columns.filter(Boolean);
  if (!headers.length) throw Error('Add column headers in the first row.');
  if (new Set(headers).size !== headers.length) throw Error('Column headers must be unique.');
  const rows: Row[] = [];
  const rowNumbers: number[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || !row.actualCellCount) return;
    const values: [string, unknown][] = [];
    row.eachCell((cell, index) => {
      const header = columns[index - 1];
      if (!header && cell.text.trim()) throw Error(`Add a header for column ${cell.col} (row ${rowNumber}).`);
      if (header && !reserved.has(header) && cell.text !== '') {
        values.push([header, typeof cell.value === 'number' || typeof cell.value === 'boolean' ? cell.value : cell.text]);
      }
    });
    if (values.length) {
      rows.push(Object.fromEntries(values));
      rowNumbers.push(rowNumber);
    }
  });
  return { columns: headers.filter(header => !reserved.has(header)), rows, rowNumbers };
}

export async function readDataForm(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  if (!request.body || !contentType.startsWith('multipart/form-data')) throw Error('Choose a file to upload.');
  const maxRequestSize = maxDataFileSize + 1024 * 1024;
  const oversized = () => Error('Choose a data file no larger than 25 MB.');
  if (Number(request.headers.get('content-length')) > maxRequestSize) throw oversized();
  let size = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxRequestSize) throw oversized();
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, { headers: { 'Content-Type': contentType } }).formData();
}

export async function readImport(name: string, bytes: Uint8Array): Promise<ImportData> {
  if (!bytes.length || bytes.length > maxDataFileSize) throw Error('Choose a nonempty file no larger than 25 MB.');
  if (/\.(?:json|geojson)$/i.test(name)) {
    const rows = jsonRows(name, bytes);
    const columns = [...new Set(rows.flatMap(row => Object.keys(row).filter(key => !reserved.has(key))))];
    if (columns.length > maxColumns) throw Error(`Use at most ${maxColumns} columns.`);
    return { columns, rows };
  }
  const data = Buffer.from(bytes);
  const workbook = new ExcelJS.Workbook();
  if (/\.xlsx$/i.test(name)) {
    await checkWorkbookSize(data);
    await workbook.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  } else if (/\.csv$/i.test(name)) {
    await workbook.csv.read(Readable.from([data]), { map: value => value });
  } else {
    throw Error('Choose an XLSX, CSV, JSON, or GeoJSON file.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw Error('The spreadsheet has no worksheet.');
  return sheetRows(sheet);
}

export async function parseRows(name: string, bytes: Uint8Array) {
  return (await readImport(name, bytes)).rows;
}

export function originalRowErrors(rowNumbers: number[] | undefined, errors: string[]) {
  if (!rowNumbers) return errors;
  return errors.map(error => error.replace(/^Row (\d+):/, (prefix, rowNumber: string) => {
    const original = rowNumbers[Number(rowNumber) - 2];
    return original === undefined ? prefix : `Row ${original}:`;
  }));
}

export function mapImportRows(input: ImportData, mapping: FormDataEntryValue | null): Row[] {
  let decoded: unknown = {};
  if (mapping) {
    if (typeof mapping !== 'string' || mapping.length > 30_000) throw Error('Send column mapping as a JSON object.');
    try {
      decoded = JSON.parse(mapping);
    } catch {
      throw Error('Send column mapping as a JSON object.');
    }
  }
  if (!isRow(decoded)) throw Error('Send column mapping as a JSON object.');
  for (const [source, target] of Object.entries(decoded)) {
    if (!input.columns.includes(source)) throw Error(`Column ${source} is not in the file.`);
    if (typeof target !== 'string' || (target !== '' && (!/^[a-z][a-z0-9_]{0,119}$/i.test(target) || reserved.has(target)))) {
      throw Error(`Choose a valid destination field for column ${source}.`);
    }
  }
  const mappedColumns = input.columns.map(source => {
    const normalized = source.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const destination = Object.hasOwn(decoded, source) ? decoded[source] as string : (standardFields.has(normalized) ? normalized : source);
    return [source, destination] as const;
  });
  const destinations = new Set<string>();
  for (const [, destination] of mappedColumns) {
    if (!destination) continue;
    if (destinations.has(destination)) throw Error(`More than one column maps to ${destination}.`);
    destinations.add(destination);
  }
  return input.rows.map(row => Object.fromEntries(mappedColumns.flatMap(([source, destination]) => {
    if (!destination || !Object.hasOwn(row, source)) return [];
    const value = row[source];
    const mapped = destination === 'business_id' && typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
    return [[destination, mapped]];
  })));
}

export function stageImageCandidates(businesses: Business[], previous: Candidate[], rows: Row[]) {
  const ids = new Set(businesses.map(business => business.business_id));
  const key = (candidate: Candidate) => `${candidate.business_id}|${candidate.source_url}`;
  const known = new Set(previous.map(key));
  const seen = new Set<string>();
  const candidates = [...previous];
  const errors: string[] = [];
  let added = 0;
  let unchanged = 0;
  let duplicates = 0;
  for (const [index, row] of rows.entries()) {
    const candidate = imageCandidate(row);
    if (!candidate || !ids.has(candidate.business_id)) {
      const problem = candidate ? `unknown business ID ${candidate.business_id}` : 'use a business ID and a valid web URL';
      errors.push(`Row ${index + 2}: ${problem}.`);
      continue;
    }
    const id = key(candidate);
    if (seen.has(id)) {
      duplicates++;
      errors.push(`Row ${index + 2}: duplicate URL for ${candidate.business_id}.`);
      continue;
    }
    seen.add(id);
    if (known.has(id)) {
      unchanged++;
      continue;
    }
    added++;
    candidates.push(candidate);
  }
  return { candidates, added, updated: 0, unchanged, duplicates, rejected: errors.length, errors };
}
