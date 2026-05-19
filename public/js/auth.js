/**
 * Session management for the Connor Family Hub frontend.
 */

const WORKER_URL = (() => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    return 'http://localhost:8787';
  }
  return 'https://connor-family-hub.arconnor626.workers.dev';
})();

const TOKEN_KEY = 'cf_session';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * Check whether the stored token is still valid.
 * Resolves to { id, name, role } on success, or null on failure.
 */
export async function checkSession() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${WORKER_URL}/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.user : null;
  } catch {
    return null;
  }
}

/**
 * Log in. Returns { token, user } on success or throws with an error message.
 */
export async function login(username, password) {
  const res = await fetch(`${WORKER_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Login failed');
  setToken(data.token);
  return data;
}

/**
 * Log out. Clears local token and tells the Worker to delete the session.
 */
export async function logout() {
  const token = getToken();
  clearToken();
  if (token) {
    try {
      await fetch(`${WORKER_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore — local token is already cleared
    }
  }
  window.location.href = '/login.html';
}

/**
 * Call at the top of any gated page.
 * Redirects to login if the session is invalid; resolves to the user object otherwise.
 */
export async function requireAuth() {
  const user = await checkSession();
  if (!user) {
    window.location.href = '/login.html';
    return null; // Execution continues briefly before redirect
  }
  return user;
}
