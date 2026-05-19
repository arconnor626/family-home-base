import { validateSession } from './session.js';

/**
 * Validates the Bearer token in the request and returns the session, or null.
 * Usage: const session = await requireAuth(request, env);
 *        if (!session) return unauthorized();
 */
export async function requireAuth(request, env) {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return validateSession(env.FAMILY_HUB_KV, token);
}

export function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

export function notFound() {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

export function badRequest(message) {
  return Response.json({ error: message }, { status: 400 });
}
