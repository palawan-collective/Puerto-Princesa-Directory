import ExcelJS from 'exceljs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { sourceFields } from './imports.ts';
import { isMediaFilename, isMediaId, siteAssetId } from './media.ts';
import { authorized, coordinates, defaultSettings, safeLink, str, type Business, type State } from './model.ts';
import { settingsIssue, settingsSchema } from './settings-validation.ts';

const mediaFields = ['business_id', 'filename', 'url', 'thumbnail', 'kind', 'source_url', 'license', 'attribution', 'permission_status', 'cover', 'alt'] as const;
const candidateFields = ['business_id', 'source_url', 'permission_status', 'filename', 'license', 'attribution'] as const;

function businessFields(businesses: Business[]) {
  const fields = new Set<string>(sourceFields);
  for (const business of businesses) {
    for (const key of Object.keys(business)) if (key !== '_manual_fields') fields.add(key);
  }
  return [...fields];
}

function cellValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

export function buildWorkbook(state: State) {
  const workbook = new ExcelJS.Workbook();
  function addSheet(name: string, fields: readonly string[], records: Record<string, unknown>[]) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(fields);
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length } };
    for (const record of records) sheet.addRow(fields.map(key => cellValue(record[key])));
  }
  addSheet('Businesses', businessFields(state.businesses), state.businesses);
  addSheet('Media', mediaFields, state.media);
  addSheet('Image candidates', candidateFields, state.candidates);
  return workbook;
}

function csvCell(value: unknown) {
  let display = String(cellValue(value));
  const plainNumber = /^[+-]?\d+(?:\.\d+)?$/;
  const phone = /^\+\d[\d ()-]{6,20}$/;
  if (/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(display) && !plainNumber.test(display) && !phone.test(display)) display = `'${display}`;
  return `"${display.replaceAll('"', '""')}"`;
}

export function buildCsv(businesses: Business[]) {
  const fields = businessFields(businesses);
  const rows = businesses.map(business => fields.map(field => csvCell(business[field])).join(','));
  return [fields.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n';
}

export function buildGeoJSON(state: State) {
  return {
    type: 'FeatureCollection' as const,
    features: state.businesses.map(business => {
      const point = coordinates(business);
      const { _manual_fields: manualFields, ...properties } = business;
      return {
        type: 'Feature' as const, id: business.business_id, properties,
        geometry: point ? { type: 'Point' as const, coordinates: [point[1], point[0]] } : null,
      };
    }),
    media: state.media,
  };
}

const text = z.string();
const id = text.refine(isMediaId, 'Use a valid business ID.');
const filename = text.refine(isMediaFilename, 'Use a managed WebP, MP4, or WebM filename.');
const count = z.number().int().nonnegative();
const coordinate = z.union([z.string(), z.number(), z.null()]).optional();
const business = z.looseObject({ business_id: id, name: text.max(250).refine(name => Boolean(name.trim()), 'Enter a business name.'), latitude: coordinate, longitude: coordinate });
const media = z.object({
  business_id: id, filename, url: text, source_url: text, license: text, attribution: text, permission_status: text,
  cover: z.boolean(), alt: text.optional(), kind: z.enum(['image', 'video']).optional(), thumbnail: text.optional(),
});
const candidate = z.object({
  business_id: id, source_url: text.refine(url => Boolean(safeLink(url)), 'Use a valid web URL.'),
  permission_status: text, filename: text.optional(), license: text.optional(), attribution: text.optional(),
});
const workspaceSchema = z.object({
  businesses: z.array(business), media: z.array(media), candidates: z.array(candidate),
  settings: settingsSchema.optional(),
  audit: z.array(z.object({ at: text, action: text, target: text })).default([]),
  imports: z.array(z.object({
    at: text, name: text, added: count, updated: count, rejected: count,
    id: text.optional(), kind: text.optional(), total: count.optional(), unchanged: count.optional(),
    duplicates: count.optional(), errors: z.array(text).optional(),
  })).default([]),
  analytics: z.array(z.object({ at: text, business_id: id, channel: text })).default([]),
});

export function parseBackup(source: string): State {
  let input: unknown;
  try {
    input = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch {
    throw Error('Choose a valid directory backup JSON file.');
  }
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw Error(`${issue.path.join('.')} ${issue.message}`.trim());
  }
  const state = { ...parsed.data, settings: parsed.data.settings ?? structuredClone(defaultSettings) };
  const issue = settingsIssue(state.settings);
  if (issue) throw Error(issue);

  const businesses = new Set<string>();
  for (const record of state.businesses) {
    if (businesses.has(record.business_id)) throw Error(`Duplicate business ID ${record.business_id}.`);
    if ((str(record.latitude) || str(record.longitude)) && !coordinates(record)) throw Error(`Invalid coordinates for ${record.business_id}.`);
    businesses.add(record.business_id);
  }

  const mediaUrls = new Set<string>();
  const siteAssets = new Set<string>();
  for (const item of state.media) {
    if (item.business_id !== siteAssetId && !businesses.has(item.business_id)) throw Error(`Unknown business ID ${item.business_id} for media ${item.filename}.`);
    const url = `/api/media?id=${item.business_id}&file=${item.filename}`;
    if (item.url !== url || item.thumbnail && item.thumbnail !== url + '&thumb=1') throw Error(`Invalid managed media URL for ${item.filename}.`);
    if (mediaUrls.has(url)) throw Error(`Duplicate media filename ${item.filename} for ${item.business_id}.`);
    mediaUrls.add(url);
    if (item.business_id === siteAssetId && item.kind !== 'video' && authorized(item.permission_status)) {
      siteAssets.add(item.url);
      if (item.thumbnail) siteAssets.add(item.thumbnail);
    }
  }
  for (const asset of [state.settings.branding.logo, ...state.settings.destinations.map(destination => destination.hero)]) {
    if (asset && !siteAssets.has(asset)) throw Error(`A site image is missing its approved media record (${asset}).`);
  }

  const candidateKeys = new Set<string>();
  for (const item of state.candidates) {
    if (!businesses.has(item.business_id)) throw Error(`Unknown business ID ${item.business_id} for an image URL candidate.`);
    const key = `${item.business_id}|${safeLink(item.source_url)}`;
    if (candidateKeys.has(key)) throw Error(`Duplicate image URL candidate for ${item.business_id}.`);
    candidateKeys.add(key);
  }
  return state;
}

export async function missingBackupMedia(state: State, directory: string) {
  const errors: string[] = [];
  for (const item of state.media) {
    const files = [item.filename];
    if (item.thumbnail) files.push(`${item.filename}.thumb.webp`);
    for (const filename of files) {
      const entry = await lstat(path.join(directory, 'images', item.business_id, filename)).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      });
      if (!entry?.isFile() || !entry.size) errors.push(`Missing media file ${item.business_id}/${filename}.`);
    }
  }
  return errors;
}
