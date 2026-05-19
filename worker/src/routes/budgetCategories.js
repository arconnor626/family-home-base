import { requireAuth, unauthorized, notFound, badRequest } from '../lib/guard.js';
import { listRecords, getRecord, putRecord, deleteRecord, newRecord } from '../lib/records.js';

const BC_PREFIX = 'finance:budget-category:';

export async function handleBudgetCategories(request, env, pathname) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const kv = env.FAMILY_HUB_KV;
  const method = request.method;

  if (pathname === '/finance/budget-categories') {
    if (method === 'GET') {
      const records = await listRecords(kv, BC_PREFIX);
      const visible = records.filter(r => r.visibility === 'shared' || r.owner === session.userId);
      visible.sort((a, b) => a.name.localeCompare(b.name));
      return Response.json(visible);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.name || body?.monthlyTarget === undefined) {
        return badRequest('name and monthlyTarget are required');
      }
      const record = newRecord({
        name: String(body.name).trim(),
        monthlyTarget: Number(body.monthlyTarget),
        visibility: body.visibility === 'private' ? 'private' : 'shared',
      }, session.userId);
      await putRecord(kv, `${BC_PREFIX}${record.id}`, record);
      return Response.json(record, { status: 201 });
    }
  }

  const match = pathname.match(/^\/finance\/budget-categories\/([^/]+)$/);
  if (match) {
    const key = `${BC_PREFIX}${match[1]}`;
    const record = await getRecord(kv, key);
    if (!record) return notFound();

    if (method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Request body required');
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const updated = {
        ...record,
        name: body.name ? String(body.name).trim() : record.name,
        monthlyTarget: body.monthlyTarget !== undefined ? Number(body.monthlyTarget) : record.monthlyTarget,
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
