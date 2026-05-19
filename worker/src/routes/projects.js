import { requireAuth, unauthorized, notFound, badRequest } from '../lib/guard.js';
import { listRecords, getRecord, putRecord, deleteRecord, newRecord } from '../lib/records.js';

const PROJECT_PREFIX = 'project:';

export async function handleProjects(request, env, pathname) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const kv = env.FAMILY_HUB_KV;
  const method = request.method;

  if (pathname === '/projects') {
    if (method === 'GET') {
      const records = await listRecords(kv, PROJECT_PREFIX);
      const visible = records.filter(r => r.visibility === 'shared' || r.owner === session.userId);
      visible.sort((a, b) => a.name.localeCompare(b.name));
      return Response.json(visible);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.name) return badRequest('name is required');
      const record = newRecord({
        name: String(body.name).trim(),
        description: body.description ? String(body.description).trim() : '',
        status: ['active', 'paused', 'complete'].includes(body.status) ? body.status : 'active',
        budget: body.budget !== undefined && body.budget !== '' ? Number(body.budget) : null,
        visibility: body.visibility === 'private' ? 'private' : 'shared',
      }, session.userId);
      await putRecord(kv, `${PROJECT_PREFIX}${record.id}`, record);
      return Response.json(record, { status: 201 });
    }
  }

  const match = pathname.match(/^\/projects\/([^/]+)$/);
  if (match) {
    const key = `${PROJECT_PREFIX}${match[1]}`;
    const record = await getRecord(kv, key);
    if (!record) return notFound();

    if (method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Request body required');
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const updated = {
        ...record,
        name: body.name ? String(body.name).trim() : record.name,
        description: body.description !== undefined ? String(body.description).trim() : record.description,
        status: ['active', 'paused', 'complete'].includes(body.status) ? body.status : record.status,
        budget: body.budget !== undefined ? (body.budget === null || body.budget === '' ? null : Number(body.budget)) : record.budget,
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
