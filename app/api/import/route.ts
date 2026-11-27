import { randomUUID } from 'node:crypto';
import { authorize } from '../../../lib/auth';
import { mapImportRows, maxDataFileSize, originalRowErrors, readDataForm, readImport, stageImageCandidates } from '../../../lib/imports';
import { mergeRecords, type State } from '../../../lib/model';
import { load, mutate } from '../../../lib/store';

const respond = (data: object, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  let form: FormData;
  let rows: Record<string, unknown>[];
  let columns: string[];
  let rowNumbers: number[] | undefined;
  let name: string;
  let kind: 'businesses' | 'urls';
  try {
    form = await readDataForm(request);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > maxDataFileSize) {
      throw Error('Choose a nonempty data file no larger than 25 MB.');
    }
    const requestedKind = form.get('kind') || 'businesses';
    if (requestedKind !== 'businesses' && requestedKind !== 'urls') throw Error('Choose a supported import type.');
    kind = requestedKind;
    name = file.name.slice(0, 250);
    const input = await readImport(file.name, new Uint8Array(await file.arrayBuffer()));
    columns = input.columns;
    rowNumbers = input.rowNumbers;
    rows = mapImportRows(input, form.get('mapping'));
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : 'Unable to read the import file.' }, 400);
  }

  const dryRun = form.get('preview') === 'true';
  const overwrite = form.get('overwrite') === 'true';
  function process(state: State) {
    const report = kind === 'urls'
      ? stageImageCandidates(state.businesses, state.candidates, rows)
      : mergeRecords(state.businesses, rows, overwrite);
    const { added, updated, unchanged, duplicates, rejected } = report;
    const errors = originalRowErrors(rowNumbers, report.errors);
    const result = { kind, dryRun, added, updated, unchanged, duplicates, rejected, errors, columns, processed: rows.length, total: rows.length };
    if (dryRun) return result;

    if ('businesses' in report) state.businesses = report.businesses;
    else state.candidates = report.candidates;

    const at = new Date().toISOString();
    const jobId = randomUUID();
    const job = { id: jobId, at, name, kind, added, updated, unchanged, duplicates, rejected, errors, total: rows.length };
    state.imports.push(job);
    state.audit.push({ at, action: kind === 'urls' ? 'Imported image URL candidates' : 'Imported business records', target: name });
    return { ...result, jobId };
  }

  try {
    return respond(dryRun ? process(await load()) : await mutate(process));
  } catch {
    return respond({ error: 'Unable to read or save the directory. Try again.' }, 500);
  }
}
