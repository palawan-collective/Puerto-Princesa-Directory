import { admin } from '../../../lib/auth';
import { buildCsv, buildGeoJSON, buildWorkbook } from '../../../lib/backup';
import { load } from '../../../lib/store';

function attachment(body: BodyInit, name: string, contentType: string) {
  return new Response(body, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${name}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(request: Request) {
  if (!await admin()) return Response.json({ error: 'Sign in to export directory data.' }, { status: 401 });
  const format = new URL(request.url).searchParams.get('format') || 'json';
  if (!['xlsx', 'csv', 'geojson', 'json'].includes(format)) return Response.json({ error: 'Choose Excel, CSV, GeoJSON, or JSON.' }, { status: 400 });
  const state = await load();

  if (format === 'xlsx') {
    const data = new Uint8Array(await buildWorkbook(state).xlsx.writeBuffer());
    return attachment(data, 'businesses.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  if (format === 'csv') return attachment(buildCsv(state.businesses), 'businesses.csv', 'text/csv; charset=utf-8');
  if (format === 'geojson') return attachment(JSON.stringify(buildGeoJSON(state)), 'businesses.geojson', 'application/geo+json');
  return attachment(JSON.stringify(state), 'directory-backup.json', 'application/json');
}
