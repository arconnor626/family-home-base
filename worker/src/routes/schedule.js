import { requireAuth, unauthorized, notFound, badRequest } from '../lib/guard.js';
import { listRecords, getRecord, putRecord, deleteRecord, newRecord } from '../lib/records.js';

const PREFIX = 'schedule:';

export async function handleSchedule(request, env, pathname) {
  // POST /schedule/events
  // GET  /schedule/events
  // PUT  /schedule/events/:id
  // DELETE /schedule/events/:id

  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const kv = env.FAMILY_HUB_KV;
  const method = request.method;

  // Collection
  if (pathname === '/schedule/events') {
    if (method === 'GET') {
      const records = await listRecords(kv, PREFIX);
      // Shared records visible to all; private records only to owner
      const visible = records.filter(
        r => r.visibility === 'shared' || r.owner === session.userId
      );
      return Response.json(visible);
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.title || !body?.date) return badRequest('title and date are required');
      const record = newRecord(
        {
          title: String(body.title).trim(),
          date: String(body.date),
          time: body.time ? String(body.time) : null,
          endTime: body.endTime ? String(body.endTime) : null,
          description: body.description ? String(body.description).trim() : '',
          allDay: body.allDay ?? false,
          visibility: body.visibility === 'private' ? 'private' : 'shared',
        },
        session.userId
      );
      await putRecord(kv, `${PREFIX}${record.id}`, record);
      return Response.json(record, { status: 201 });
    }
  }

  // Single item  /schedule/events/:id
  const match = pathname.match(/^\/schedule\/events\/([^/]+)$/);
  if (match) {
    const id = match[1];
    const key = `${PREFIX}${id}`;
    const record = await getRecord(kv, key);
    if (!record) return notFound();

    if (method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Request body required');
      // Only owner may update
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const updated = {
        ...record,
        title: body.title ? String(body.title).trim() : record.title,
        date: body.date ? String(body.date) : record.date,
        time: body.time !== undefined ? (body.time ? String(body.time) : null) : record.time,
        endTime: body.endTime !== undefined ? (body.endTime ? String(body.endTime) : null) : record.endTime,
        description: body.description !== undefined ? String(body.description).trim() : record.description,
        allDay: body.allDay !== undefined ? Boolean(body.allDay) : record.allDay,
        visibility: body.visibility === 'private' ? 'private' : (body.visibility === 'shared' ? 'shared' : record.visibility),
        updatedAt: new Date().toISOString(),
      };
      await putRecord(kv, key, updated);
      return Response.json(updated);
    }

    if (method === 'DELETE') {
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      await deleteRecord(kv, key);
      return new Response(null, { status: 204 });
    }
  }

  return null;
}
