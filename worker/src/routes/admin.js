import { requireAuth, unauthorized, forbidden, notFound, badRequest } from '../lib/guard.js';
import { hashPassword } from '../lib/crypto.js';

const USER_PREFIX = 'user:';
const VALID_ROLES = ['admin', 'parent', 'child', 'guest'];

function safeUser(record) {
  const { passwordHash, ...rest } = record;
  return rest;
}

export async function handleAdmin(request, env, pathname) {
  if (!pathname.startsWith('/admin/')) return null;

  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const kv = env.FAMILY_HUB_KV;
  const raw = await kv.get(session.userId);
  if (!raw) return unauthorized();
  const adminUser = JSON.parse(raw);
  if (adminUser.role !== 'admin') return forbidden();

  const method = request.method;

  // ── GET /admin/users ────────────────────────────────────────────────────────
  if (pathname === '/admin/users' && method === 'GET') {
    const { keys } = await kv.list({ prefix: USER_PREFIX });
    const users = await Promise.all(
      keys.map(async k => {
        const r = await kv.get(k.name);
        return r ? safeUser(JSON.parse(r)) : null;
      })
    );
    return Response.json(users.filter(Boolean));
  }

  // ── POST /admin/users ───────────────────────────────────────────────────────
  if (pathname === '/admin/users' && method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body?.username || !body?.name || !body?.password || !body?.role) {
      return badRequest('username, name, role, and password are required');
    }
    const username = String(body.username).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
    if (username.length < 2 || username.length > 32) return badRequest('Username must be 2–32 characters');
    if (!VALID_ROLES.includes(body.role)) return badRequest('Invalid role');
    if (String(body.password).length < 8) return badRequest('Password must be at least 8 characters');

    const key = `${USER_PREFIX}${username}`;
    if (await kv.get(key)) return Response.json({ error: 'Username already taken' }, { status: 409 });

    const record = {
      id: key,
      name: String(body.name).trim(),
      role: body.role,
      passwordHash: await hashPassword(String(body.password)),
    };
    await kv.put(key, JSON.stringify(record));
    return Response.json(safeUser(record), { status: 201 });
  }

  // ── /admin/users/:username ──────────────────────────────────────────────────
  const userMatch = pathname.match(/^\/admin\/users\/([^/]+)$/);
  if (userMatch) {
    const username = userMatch[1];
    const key = `${USER_PREFIX}${username}`;
    const userRaw = await kv.get(key);
    if (!userRaw) return notFound();
    const record = JSON.parse(userRaw);

    if (method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Request body required');
      const updated = {
        ...record,
        name: body.name ? String(body.name).trim() : record.name,
        role: VALID_ROLES.includes(body.role) ? body.role : record.role,
      };
      if (body.password) {
        if (String(body.password).length < 8) return badRequest('Password must be at least 8 characters');
        updated.passwordHash = await hashPassword(String(body.password));
      }
      await kv.put(key, JSON.stringify(updated));
      return Response.json(safeUser(updated));
    }

    if (method === 'DELETE') {
      if (record.id === session.userId) {
        return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
      }
      await kv.delete(key);
      return new Response(null, { status: 204 });
    }
  }

  return null;
}
