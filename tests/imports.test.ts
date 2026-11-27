import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as imports from '../lib/imports.ts';
import { mergeRecords, type Business } from '../lib/model.ts';

const text = (source: string) => new TextEncoder().encode(source);

test('CSV preserves international phone numbers and quoted multiline descriptions', async () => {
  const rows = await imports.parseRows('businesses.csv', text('business_id,name,phone,description\r\nBIZ-001,Harbor, +639999315667,"Line one\nLine two"'));
  assert.equal(rows[0].phone, ' +639999315667');
  assert.equal(rows[0].description, 'Line one\nLine two');
});

test('GeoJSON point coordinates and unmapped listings survive parsing', async () => {
  const rows = await imports.parseRows('businesses.geojson', text(JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', id: 'pin', properties: { name: 'Port' }, geometry: { type: 'Point', coordinates: [118.7, 9.7] } },
      { type: 'Feature', properties: { business_id: 'walk', name: 'Walk' }, geometry: null },
    ],
  })));
  assert.deepEqual(rows.map(row => ({ ...row })), [
    { business_id: 'pin', name: 'Port', longitude: 118.7, latitude: 9.7 },
    { business_id: 'walk', name: 'Walk' },
  ]);
});

test('column mapping renames source columns without dropping unmapped source metadata', async () => {
  const source = await imports.readImport('places.csv', text('Business Ref,Title,source_url\nBIZ-1,Harbor,Overture Maps'));
  assert.deepEqual(source.columns, ['Business Ref', 'Title', 'source_url']);
  const rows = imports.mapImportRows(source, JSON.stringify({ 'Business Ref': 'business_id', Title: 'name' }));
  assert.deepEqual(rows.map(row => ({ ...row })), [{ business_id: 'BIZ-1', name: 'Harbor', source_url: 'Overture Maps' }]);
  assert.throws(() => imports.mapImportRows(source, '{"Title":"business_id","Business Ref":"business_id"}'), /business_id/);
});

test('image URL manifests stage candidates, count repeat URLs and flag unmatched IDs', () => {
  const previous = [{ business_id: 'BIZ-1', source_url: 'https://example.org/existing', permission_status: 'pending' }];
  const businesses = [{ business_id: 'BIZ-1', name: 'Harbor' }];
  const rows = [
    { business_id: 'BIZ-1', image_url: 'https://example.org/existing' },
    { business_id: 'BIZ-1', image_url: 'https://example.org/new' },
    { business_id: 'BIZ-1', image_url: 'https://example.org/new' },
    { business_id: 'BIZ-MISSING', image_url: 'https://example.org/new' },
  ];
  const result = imports.stageImageCandidates(businesses, previous, rows);
  assert.equal(previous.length, 1);
  assert.equal(result.added, 1);
  assert.equal(result.unchanged, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.rejected, 2);
  assert.equal(result.candidates[1].permission_status, 'pending');
  assert.match(result.errors[1], /BIZ-MISSING/);
});

test('the supplied workbook has the same 3,135 IDs and 37 source fields as the snapshot', async () => {
  const workbook = await readFile(new URL('../../../data/Palawan_Business_Directory.xlsx', import.meta.url));
  const source = await imports.readImport('Palawan_Business_Directory.xlsx', workbook);
  const snapshot: Business[] = JSON.parse(await readFile(new URL('../data/businesses.json', import.meta.url), 'utf8'));
  assert.equal(source.columns.length, 37);
  assert.equal(source.rows.length, 3135);
  const byId = new Map(snapshot.map(record => [record.business_id, record]));
  for (const row of source.rows) {
    const record = byId.get(String(row.business_id));
    assert.ok(record, String(row.business_id));
    for (const key of source.columns) assert.equal(row[key] ?? null, record[key], `${row.business_id} ${key}`);
  }
  const result = mergeRecords(snapshot, source.rows);
  assert.deepEqual([result.added, result.updated, result.unchanged, result.rejected], [0, 0, 3135, 0]);
});

test('workbook exports preserve source text and list managed media on a separate sheet', async () => {
  const { buildWorkbook } = await import('../lib/backup.ts');
  const { default: ExcelJS } = await import('exceljs');
  const state = await smallBackup();
  const workbook = await buildWorkbook(state);
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(output.getWorksheet('Businesses')?.getRow(1).actualCellCount, 37);
  assert.equal(output.getWorksheet('Businesses')?.getRow(2).getCell(11).text, '+639999315667');
  assert.equal(output.getWorksheet('Media')?.getRow(2).getCell(2).text, state.media[0].filename);
});

test('exports keep unmapped businesses and protect spreadsheet downloads from formula text', async () => {
  const { buildGeoJSON, buildCsv } = await import('../lib/backup.ts');
  const state = await smallBackup();
  state.businesses.push({ business_id: 'BIZ-2', name: '=A1' });
  assert.equal(buildGeoJSON(state).features[1].geometry, null);
  assert.deepEqual(buildGeoJSON(state).features[0].geometry?.coordinates, [118.7, 9.7]);
  assert.match(buildCsv(state.businesses), /"'=A1"/);
});

test('restore accepts an exported workspace and rejects duplicate IDs and unsafe media paths', async () => {
  const { parseBackup } = await import('../lib/backup.ts');
  const state = await smallBackup();
  assert.deepEqual(parseBackup(JSON.stringify(state)), state);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, businesses: [...state.businesses, ...state.businesses] })), /duplicate business ID/i);
  const media = [{ ...state.media[0], filename: '../bad.webp' }];
  assert.throws(() => parseBackup(JSON.stringify({ ...state, media })), /filename/i);
});

async function smallBackup() {
  const { defaultSettings } = await import('../lib/model.ts');
  const filename = 'BIZ-1-000000000000000000000000.webp';
  return {
    businesses: [{ business_id: 'BIZ-1', name: 'Harbor', phone: '+639999315667', latitude: '9.7', longitude: '118.7' }] as Business[],
    media: [{ business_id: 'BIZ-1', filename, url: `/api/media?id=BIZ-1&file=${filename}`, source_url: 'https://example.org/image', license: 'Owner permission', attribution: '', permission_status: 'approved', cover: true }],
    candidates: [], settings: structuredClone(defaultSettings), audit: [], imports: [], analytics: [],
  };
}

test('spreadsheet validation identifies the visible spreadsheet row after skipped blank lines', async () => {
  const source = await imports.readImport('places.csv', text('business_id,name\nBIZ-1,Harbor\n\n../bad,Invalid'));
  const result = mergeRecords([], source.rows);
  assert.equal(result.added, 1);
  assert.equal(result.rejected, 1);
  assert.match(imports.originalRowErrors(source.rowNumbers, result.errors)[0], /^Row 4:/);
});
