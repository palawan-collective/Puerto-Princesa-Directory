import {mutate} from '../../../lib/store';
import {str, type Editorial, type State} from '../../../lib/model';
import {settingsIssue} from '../../../lib/settings-validation';

export const runtime = 'nodejs';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'story';
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== 'object') return Response.json({ error: 'Invalid submission.' }, { status: 400 });

  const destination = str((input as any).destination) || 'puerto-princesa';
  const title = str((input as any).title);
  const body = str((input as any).body);
  const author = str((input as any).author);
  const email = str((input as any).email);
  const category = str((input as any).category) || 'Community story';
  const excerpt = str((input as any).excerpt);
  const businesses = str((input as any).businesses);

  if (!title || title.length < 4) return Response.json({ error: 'Please add a title.' }, { status: 400 });
  if (!body || body.length < 40) return Response.json({ error: 'Please write at least a short story.' }, { status: 400 });
  if (!author || author.length < 2) return Response.json({ error: 'Please add your name.' }, { status: 400 });

  let createdId = '';
  try {
    await mutate((s: State) => {
      const dest = s.settings.destinations.find(d => d.slug === destination && d.status === 'published');
      if (!dest) throw new Error('Unknown destination.');
      const existing = new Set(s.settings.guides.map(g => g.id));
      let id = slugify(title);
      if (existing.has(id)) {
        let n = 2;
        while (existing.has(`${id}-${n}`)) n++;
        id = `${id}-${n}`;
      }
      const entry: Editorial = {
        id,
        title,
        destination,
        status: 'pending',
        body,
        businesses,
        category,
        excerpt: excerpt || body.slice(0, 160),
        author,
        authorType: 'community',
        submittedBy: author,
        submittedEmail: email,
        submittedAt: new Date().toISOString(),
      };
      s.settings.guides = [entry, ...s.settings.guides];
      createdId = id;
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message || 'Could not save your story.' }, { status: 400 });
  }

  return Response.json({ ok: true, id: createdId });
}
