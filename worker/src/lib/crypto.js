// Password hashing via Web Crypto API (PBKDF2). Works identically in Workers
// and in Node 15+ (where crypto.webcrypto exposes the same interface).

const ITERATIONS = 100_000;
const DIGEST = 'SHA-256';
const KEY_BYTES = 32;

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hashBuf = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: DIGEST },
    keyMaterial, KEY_BYTES * 8
  );
  return {
    salt: toHex(salt),
    hash: toHex(new Uint8Array(hashBuf)),
    iterations: ITERATIONS,
    digest: DIGEST,
  };
}

export async function verifyPassword(password, stored) {
  const encoder = new TextEncoder();
  const salt = fromHex(stored.salt);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hashBuf = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: stored.iterations, hash: stored.digest },
    keyMaterial, KEY_BYTES * 8
  );
  return timingSafeEqual(toHex(new Uint8Array(hashBuf)), stored.hash);
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
