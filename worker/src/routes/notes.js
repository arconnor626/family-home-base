import { requireAuth, unauthorized, notFound, badRequest } from '../lib/guard.js';
import { listRecords, getRecord, putRecord, deleteRecord, newRecord } from '../lib/records.js';

const NOTE_PREFIX = 'note:';

export async function handleNotes(request, env, pathname) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const kv = env.FAMILY_HUB_KV;
  const method = request.method;

  if (pathname === '/notes') {
    if (method === 'GET') {
      const records = await listRecords(kv, NOTE_PREFIX);
      const visible = records.filter(r => r.visibility === 'shared' || r.owner === session.userId);
      visible.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return Response.json(visible);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.text) return badRequest('text is required');
      const record = newRecord({
        text: String(body.text).trim(),
        visibility: body.visibility === 'private' ? 'private' : 'shared',
      }, session.userId);
      await putRecord(kv, `${NOTE_PREFIX}${record.id}`, record);
      return Response.json(record, { status: 201 });
    }
  }

  const match = pathname.match(/^\/notes\/([^/]+)$/);
  if (match) {
    const key = `${NOTE_PREFIX}${match[1]}`;
    const record = await getRecord(kv, key);
    if (!record) return notFound();

    if (method === 'DELETE') {
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      await deleteRecord(kv, key);
      return new Response(null, { status: 204 });
    }
  }

  return null;
}
