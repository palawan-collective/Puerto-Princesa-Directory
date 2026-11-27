import { authorize } from '../../../lib/auth';
import { missingBackupMedia, parseBackup } from '../../../lib/backup';
import { maxDataFileSize, readDataForm } from '../../../lib/imports';
import { withMediaWrite } from '../../../lib/media';
import type { State } from '../../../lib/model';
import { dataDirectory, mutate } from '../../../lib/store';

const respond = (data: object, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  let snapshot: State;
  let dryRun: boolean;
  let name: string;
  try {
    const form = await readDataForm(request);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > maxDataFileSize || !/\.json$/i.test(file.name)) {
      throw Error('Choose a nonempty JSON directory backup no larger than 25 MB.');
    }
    name = file.name.slice(0, 250);
    dryRun = form.get('preview') === 'true';
    if (!dryRun && form.get('confirm') !== 'restore') throw Error('Confirm that you want to replace the directory with this backup.');
    snapshot = parseBackup(await file.text());
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : 'Unable to read the backup.' }, 400);
  }

  const counts = {
    dryRun, businesses: snapshot.businesses.length, media: snapshot.media.length,
    candidates: snapshot.candidates.length, destinations: snapshot.settings.destinations.length,
  };
  const validateMedia = () => missingBackupMedia(snapshot, dataDirectory);
  try {
    if (dryRun) {
      const errors = await validateMedia();
      return respond({ ...counts, ok: errors.length === 0, errors });
    }
    return await withMediaWrite(async () => {
      const errors = await validateMedia();
      if (errors.length) return respond({ ...counts, error: 'Restore requires the referenced local media files.', errors }, 400);
      await mutate(state => {
        snapshot.audit.push({ at: new Date().toISOString(), action: 'Restored directory backup', target: name });
        Object.assign(state, snapshot);
      });
      return respond({ ...counts, ok: true, errors: [] });
    });
  } catch {
    return respond({ error: 'Unable to validate media storage or restore the directory. Try again.' }, 500);
  }
}
