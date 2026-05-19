import { requireAuth, unauthorized } from '../lib/guard.js';
import { validateSession } from '../lib/session.js';
import { listRecords } from '../lib/records.js';

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CAL_API   = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_SCOPE   = 'https://www.googleapis.com/auth/calendar.readonly';
const SCHEDULE_PREFIX  = 'schedule:';

const FRONTEND_URL = 'https://master.connor-family-hub-v2.pages.dev';

function redirectUri(env) {
  return env.GOOGLE_REDIRECT_URI ??
    'https://connor-family-hub.arconnor626.workers.dev/integrations/google/callback';
}

export async function handleIntegrations(request, env, pathname) {
  const method = request.method;

  // ── OAuth callback — browser redirect; no Authorization header ──────────────
  if (pathname === '/integrations/google/callback' && method === 'GET') {
    return googleCallback(request, env);
  }

  // ── All other integration routes require auth ────────────────────────────────
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  if (pathname === '/integrations/google/auth'       && method === 'GET')    return googleAuth(request, env, session);
  if (pathname === '/integrations/google/status'     && method === 'GET')    return googleStatus(env, session);
  if (pathname === '/integrations/google/sync'       && method === 'POST')   return googleSync(env, session);
  if (pathname === '/integrations/google/disconnect' && method === 'DELETE') return googleDisconnect(env, session);

  return null;
}

// ── Auth kick-off ─────────────────────────────────────────────────────────────

async function googleAuth(request, env, session) {
  if (!env.GOOGLE_CLIENT_ID) {
    return Response.json({ error: 'Google integration not configured on this server.' }, { status: 503 });
  }
  // Use the raw Bearer token as the OAuth state so we can identify the user in the callback
  const token = (request.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  const params = new URLSearchParams({
    client_id:     env.GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUri(env),
    response_type: 'code',
    scope:         CALENDAR_SCOPE,
    access_type:   'offline',
    prompt:        'consent',
    state:         token,
  });
  return Response.json({ authUrl: `${GOOGLE_AUTH_URL}?${params}` });
}

// ── OAuth callback (browser lands here after Google consent) ──────────────────

async function googleCallback(request, env) {
  const url    = new URL(request.url);
  const code   = url.searchParams.get('code');
  const state  = url.searchParams.get('state'); // session token
  const error  = url.searchParams.get('error');

  if (error || !code || !state) {
    const reason = encodeURIComponent(error ?? 'missing_params');
    return Response.redirect(`${FRONTEND_URL}/?google=error&reason=${reason}`, 302);
  }

  // Validate the session token carried in state
  const session = await validateSession(env.FAMILY_HUB_KV, state);
  if (!session) {
    return Response.redirect(`${FRONTEND_URL}/?google=error&reason=invalid_session`, 302);
  }

  // Exchange authorisation code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  redirectUri(env),
      grant_type:    'authorization_code',
    }),
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.access_token) {
    return Response.redirect(`${FRONTEND_URL}/?google=error&reason=token_exchange`, 302);
  }

  const integration = {
    userId:       session.userId,
    accessToken:  tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenExpiry:  new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    calendarId:   'primary',
    connectedAt:  new Date().toISOString(),
    lastSync:     null,
  };
  await env.FAMILY_HUB_KV.put(`integration:google:${session.userId}`, JSON.stringify(integration));

  return Response.redirect(`${FRONTEND_URL}/?google=connected`, 302);
}

// ── Status ────────────────────────────────────────────────────────────────────

async function googleStatus(env, session) {
  const raw = await env.FAMILY_HUB_KV.get(`integration:google:${session.userId}`);
  if (!raw) return Response.json({ connected: false });
  const { userId: _u, accessToken: _a, refreshToken: _r, tokenExpiry: _e, ...pub } = JSON.parse(raw);
  return Response.json({ connected: true, ...pub });
}

// ── Disconnect ────────────────────────────────────────────────────────────────

async function googleDisconnect(env, session) {
  await env.FAMILY_HUB_KV.delete(`integration:google:${session.userId}`);
  return new Response(null, { status: 204 });
}

// ── Sync ──────────────────────────────────────────────────────────────────────

async function googleSync(env, session) {
  const raw = await env.FAMILY_HUB_KV.get(`integration:google:${session.userId}`);
  if (!raw) return Response.json({ error: 'Google Calendar not connected.' }, { status: 400 });
  const integration = JSON.parse(raw);

  // Refresh token if needed
  let accessToken;
  try {
    accessToken = await getValidToken(integration, env);
  } catch {
    return Response.json({ error: 'Access token refresh failed. Please reconnect Google Calendar.' }, { status: 401 });
  }

  // Fetch next 90 days from Google Calendar
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const calRes = await fetch(
    `${GOOGLE_CAL_API}/calendars/${encodeURIComponent(integration.calendarId)}/events?` +
    new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '500' }),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!calRes.ok) {
    const detail = await calRes.json().catch(() => ({}));
    return Response.json({ error: 'Google Calendar API error.', detail }, { status: 502 });
  }

  const { items: gEvents = [] } = await calRes.json();

  // Build set of incoming Google event IDs
  const incomingIds = new Set(gEvents.map(ge => `gcal_${ge.id.replace(/[^a-zA-Z0-9]/g, '_')}`));

  // Remove stale synced events for this user that are no longer in the result window
  const existing = await listRecords(env.FAMILY_HUB_KV, SCHEDULE_PREFIX);
  const stale = existing.filter(
    e => e.source === 'google' && e.owner === session.userId && !incomingIds.has(e.id),
  );
  await Promise.all(stale.map(e => env.FAMILY_HUB_KV.delete(`${SCHEDULE_PREFIX}${e.id}`)));

  // Upsert incoming events
  let synced = 0;
  for (const ge of gEvents) {
    const isAllDay = !!ge.start?.date;
    const date = isAllDay ? ge.start.date : ge.start?.dateTime?.slice(0, 10);
    if (!date) continue;

    const id = `gcal_${ge.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const record = {
      id,
      owner:       session.userId,
      visibility:  'shared',
      source:      'google',
      googleId:    ge.id,
      title:       ge.summary ?? '(No title)',
      date,
      allDay:      isAllDay,
      time:        isAllDay ? null : (ge.start.dateTime?.slice(11, 16) ?? null),
      endTime:     isAllDay ? null : (ge.end?.dateTime?.slice(11, 16) ?? null),
      description: ge.description ?? '',
      createdAt:   ge.created  ?? new Date().toISOString(),
      updatedAt:   ge.updated  ?? new Date().toISOString(),
    };
    await env.FAMILY_HUB_KV.put(`${SCHEDULE_PREFIX}${id}`, JSON.stringify(record));
    synced++;
  }

  // Persist updated token + lastSync
  integration.lastSync = new Date().toISOString();
  await env.FAMILY_HUB_KV.put(`integration:google:${session.userId}`, JSON.stringify(integration));

  return Response.json({ synced, removed: stale.length });
}

// ── Token refresh helper ──────────────────────────────────────────────────────

async function getValidToken(integration, env) {
  // Still valid with ≥5 min buffer?
  if (new Date(integration.tokenExpiry) > new Date(Date.now() + 5 * 60 * 1000)) {
    return integration.accessToken;
  }
  if (!integration.refreshToken) throw new Error('No refresh token stored.');

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: integration.refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  const tokens = await res.json().catch(() => ({}));
  if (!res.ok || !tokens.access_token) throw new Error('Token refresh failed.');

  integration.accessToken = tokens.access_token;
  integration.tokenExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  await env.FAMILY_HUB_KV.put(`integration:google:${integration.userId}`, JSON.stringify(integration));
  return tokens.access_token;
}
