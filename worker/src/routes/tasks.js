import { requireAuth, unauthorized, notFound, badRequest } from '../lib/guard.js';
import { listRecords, getRecord, putRecord, deleteRecord, newRecord } from '../lib/records.js';

const TASK_PREFIX = 'task:';

export async function handleTasks(request, env, pathname) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const kv = env.FAMILY_HUB_KV;
  const method = request.method;

  if (pathname === '/tasks') {
    if (method === 'GET') {
      const records = await listRecords(kv, TASK_PREFIX);
      const visible = records.filter(r => r.visibility === 'shared' || r.owner === session.userId);
      visible.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
      return Response.json(visible);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.title) return badRequest('title is required');
      const record = newRecord({
        title: String(body.title).trim(),
        dueDate: body.dueDate || null,
        assignee: body.assignee || null,
        priority: ['low', 'normal', 'high'].includes(body.priority) ? body.priority : 'normal',
        status: 'open',
        reminderTime: body.reminderTime || null,
        projectId: body.projectId || null,
        notes: body.notes ? String(body.notes).trim() : '',
        visibility: body.visibility === 'private' ? 'private' : 'shared',
      }, session.userId);
      await putRecord(kv, `${TASK_PREFIX}${record.id}`, record);
      return Response.json(record, { status: 201 });
    }
  }

  const match = pathname.match(/^\/tasks\/([^/]+)$/);
  if (match) {
    const key = `${TASK_PREFIX}${match[1]}`;
    const record = await getRecord(kv, key);
    if (!record) return notFound();

    if (method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Request body required');
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const updated = {
        ...record,
        title: body.title ? String(body.title).trim() : record.title,
        dueDate: body.dueDate !== undefined ? (body.dueDate || null) : record.dueDate,
        assignee: body.assignee !== undefined ? (body.assignee || null) : record.assignee,
        priority: ['low', 'normal', 'high'].includes(body.priority) ? body.priority : record.priority,
        status: ['open', 'done'].includes(body.status) ? body.status : record.status,
        reminderTime: body.reminderTime !== undefined ? (body.reminderTime || null) : record.reminderTime,
        projectId: body.projectId !== undefined ? (body.projectId || null) : record.projectId,
        notes: body.notes !== undefined ? String(body.notes).trim() : record.notes,
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
