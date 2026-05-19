import { verifyPassword } from '../lib/crypto.js';
import { createSession, validateSession, deleteSession } from '../lib/session.js';

export async function handleAuth(request, env, pathname) {
  if (pathname === '/auth/login' && request.method === 'POST') {
    return login(request, env);
  }
  if (pathname === '/auth/logout' && request.method === 'POST') {
    return logout(request, env);
  }
  if (pathname === '/auth/session' && request.method === 'GET') {
    return sessionCheck(request, env);
  }
  if (pathname === '/users' && request.method === 'GET') {
    return listUsers(request, env);
  }
  return null; // Not an auth route
}

async function login(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { username, password } = body ?? {};
  if (!username || !password) {
    return json({ error: 'Username and password are required' }, 400);
  }

  const userRaw = await env.FAMILY_HUB_KV.get(`user:${username.toLowerCase().trim()}`);
  if (!userRaw) {
    // Always run a hash to prevent timing-based username enumeration
    await fakeHashDelay();
    return json({ error: 'Invalid credentials' }, 401);
  }

  const user = JSON.parse(userRaw);
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return json({ error: 'Invalid credentials' }, 401);
  }

  const token = await createSession(env.FAMILY_HUB_KV, user.id);
  return json({ token, user: { id: user.id, name: user.name, role: user.role } });
}

async function logout(request, env) {
  const token = extractToken(request);
  await deleteSession(env.FAMILY_HUB_KV, token);
  return json({ ok: true });
}

async function sessionCheck(request, env) {
  const token = extractToken(request);
  const session = await validateSession(env.FAMILY_HUB_KV, token);
  if (!session) return json({ ok: false }, 401);

  const userRaw = await env.FAMILY_HUB_KV.get(session.userId);
  if (!userRaw) return json({ ok: false }, 401);

  const user = JSON.parse(userRaw);
  return json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}

async function listUsers(request, env) {
  const token = extractToken(request);
  const session = await validateSession(env.FAMILY_HUB_KV, token);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { keys } = await env.FAMILY_HUB_KV.list({ prefix: 'user:' });
  const users = await Promise.all(
    keys.map(async k => {
      const raw = await env.FAMILY_HUB_KV.get(k.name);
      if (!raw) return null;
      const u = JSON.parse(raw);
      return { id: u.id, name: u.name };
    })
  );
  return json(users.filter(Boolean));
}

// --- helpers -----------------------------------------------------------------

function extractToken(request) {
  const auth = request.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function fakeHashDelay() {
  // Keeps invalid-username response time close to valid-username response time
  await new Promise(r => setTimeout(r, 80));
}
