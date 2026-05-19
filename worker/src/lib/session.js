const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function createSession(kv, userId) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await kv.put(`session:${token}`, JSON.stringify({ userId, expiresAt }), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function validateSession(kv, token) {
  if (!token) return null;
  const raw = await kv.get(`session:${token}`);
  if (!raw) return null;
  const session = JSON.parse(raw);
  if (session.expiresAt < Date.now()) {
    await kv.delete(`session:${token}`);
    return null;
  }
  return session;
}

export async function deleteSession(kv, token) {
  if (token) await kv.delete(`session:${token}`);
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
