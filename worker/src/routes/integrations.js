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

// Stable short slug for a calendar ID (used in KV event keys to prevent cross-calendar collisions)
function calSlug(calId) {
  let h = 0;
  for (let i = 0; i < calId.length; i++) { h = (Math.imul(31, h) + calId.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36).padStart(6, '0');
}

export async function handleIntegrations(request, env, pathname) {
  const method = request.method;

  // OAuth callback arrives as a plain browser redirect — no auth header
  if (pathname === '/integrations/google/callback' && method === 'GET') {
    return googleCallback(request, env);
  }

  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  if (pathname === '/integrations/google/auth'       && method === 'GET')    return googleAuth(request, env, session);
  if (pathname === '/integrations/google/status'     && method === 'GET')    return googleStatus(env, session);
  if (pathname === '/integrations/google/calendars'  && method === 'GET')    return googleListAvailable(env, session);
  if (pathname === '/integrations/google/calendars'  && method === 'PUT')    return googleSaveCalendars(request, env, session);
  if (pathname === '/integrations/google/sync'       && method === 'POST')   return googleSync(env, session);
  if (pathname === '/integrations/google/disconnect' && method === 'DELETE') return googleDisconnect(env, session);

  return null;
}

// ── Auth kick-off ─────────────────────────────────────────────────────────────

async function googleAuth(request, env, session) {
  if (!env.GOOGLE_CLIENT_ID) {
    return Response.json({ error: 'Google integration not configured on this server.' }, { status: 503 });
  }
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

// ── OAuth callback ────────────────────────────────────────────────────────────

async function googleCallback(request, env) {
  const url   = new URL(request.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error || !code || !state) {
    return Response.redirect(`${FRONTEND_URL}/?google=error&reason=${encodeURIComponent(error ?? 'missing_params')}`, 302);
  }

  const session = await validateSession(env.FAMILY_HUB_KV, state);
  if (!session) {
    return Response.redirect(`${FRONTEND_URL}/?google=error&reason=invalid_session`, 302);
  }

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

  // Preserve existing syncedCalendars if reconnecting
  const existing = await env.FAMILY_HUB_KV.get(`integration:google:${session.userId}`);
  const prev = existing ? JSON.parse(existing) : {};

  const integration = {
    userId:          session.userId,
    accessToken:     tokens.access_token,
    refreshToken:    tokens.refresh_token ?? prev.refreshToken ?? null,
    tokenExpiry:     new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    connectedAt:     prev.connectedAt ?? new Date().toISOString(),
    lastSync:        prev.lastSync ?? null,
    syncedCalendars: prev.syncedCalendars ?? [],
  };
  await env.FAMILY_HUB_KV.put(`integration:google:${session.userId}`, JSON.stringify(integration));

  return Response.redirect(`${FRONTEND_URL}/?google=connected`, 302);
}

// ── Status ────────────────────────────────────────────────────────────────────

async function googleStatus(env, session) {
  const raw = await env.FAMILY_HUB_KV.get(`integration:google:${session.userId}`);
  if (!raw) return Response.json({ connected: false });
  const { accessToken: _a, refreshToken: _r, tokenExpiry: _e, ...pub } = JSON.parse(raw);
  return Response.json({ connected: true, ...pub, syncedCalendars: pub.syncedCalendars ?? [] });
}

// ── List available Google calendars ──────────────────────────────────────────

async function googleListAvailable(env, session) {
  const raw = await env.FAMILY_HUB_KV.get(`integration:google:${session.userId}`);
  if (!raw) return Response.json({ error: 'Not connected' }, { status: 400 });
  const integration = JSON.parse(raw);

  let accessToken;
  try { accessToken = await getValidToken(integration, env); }
  catch { return Response.json({ error: 'Token refresh failed. Please reconnect.' }, { status: 401 }); }

  const res = await fetch(`${GOOGLE_CAL_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return Response.json({ error: 'Failed to fetch calendars' }, { status: 502 });

  const data = await res.json();
  return Response.json((data.items ?? []).map(c => ({
    id:      c.id,
    summary: c.summary,
    primary: c.primary ?? false,
    color:   c.backgroundColor ?? null,
  })));
}

// ── Save calendar list ────────────────────────────────────────────────────────
// Body: { calendars: [{ id, summary, ownerId }] }
// ownerId = userId string (e.g. "user:alex") or null for "family only"

async function googleSaveCalendars(request, env, session) {
  const raw = await env.FAMILY_HUB_KV.get(`integration:google:${session.userId}`);
  if (!raw) return Response.json({ error: 'Not connected' }, { status: 400 });
  const integration = JSON.parse(raw);

  const body = await request.json().catch(() => null);
  if (!body?.calendars || !Array.isArray(body.calendars)) {
    return Response.json({ error: 'calendars array required' }, { status: 400 });
  }

  integration.syncedCalendars = body.calendars.map(c => ({
    id:      String(c.id),
    summary: String(c.summary),
    ownerId: c.ownerId ?? null,
  }));

  await env.FAMILY_HUB_KV.put(`integration:google:${session.userId}`, JSON.stringify(integration));
  return Response.json({ syncedCalendars: integration.syncedCalendars });
}

// ── Disconnect ────────────────────────────────────────────────────────────────

async function googleDisconnect(env, session) {
  // Also remove all synced events for this user
  const all = await listRecords(env.FAMILY_HUB_KV, SCHEDULE_PREFIX);
  const mine = all.filter(e => e.source === 'google' && e.owner === session.userId);
  await Promise.all(mine.map(e => env.FAMILY_HUB_KV.delete(`${SCHEDULE_PREFIX}${e.id}`)));
  await env.FAMILY_HUB_KV.delete(`integration:google:${session.userId}`);
  return new Response(null, { status: 204 });
}

// ── Sync all configured calendars ────────────────────────────────────────────

async function googleSync(env, session) {
  const raw = await env.FAMILY_HUB_KV.get(`integration:google:${session.userId}`);
  if (!raw) return Response.json({ error: 'Google Calendar not connected.' }, { status: 400 });
  const integration = JSON.parse(raw);

  if (!integration.syncedCalendars?.length) {
    return Response.json({ error: 'No calendars configured. Add at least one calendar first.' }, { status: 400 });
  }

  let accessToken;
  try { accessToken = await getValidToken(integration, env); }
  catch { return Response.json({ error: 'Access token refresh failed. Please reconnect Google Calendar.' }, { status: 401 }); }

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  let totalSynced = 0, totalRemoved = 0;

  for (const cal of integration.syncedCalendars) {
    const slug = calSlug(cal.id);

    const calRes = await fetch(
      `${GOOGLE_CAL_API}/calendars/${encodeURIComponent(cal.id)}/events?` +
      new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '500' }),
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!calRes.ok) continue; // skip inaccessible calendars silently

    const { items: gEvents = [] } = await calRes.json();

    // Events for this calendar are keyed as gcal_<calSlug>_<eventSlug>
    const incomingIds = new Set(
      gEvents.map(ge => `gcal_${slug}_${ge.id.replace(/[^a-zA-Z0-9]/g, '_')}`)
    );

    // Remove stale events belonging to this specific calendar
    const existing = await listRecords(env.FAMILY_HUB_KV, SCHEDULE_PREFIX);
    const stale = existing.filter(
      e => e.source === 'google' && e.googleCalendarId === cal.id && !incomingIds.has(e.id)
    );
    await Promise.all(stale.map(e => env.FAMILY_HUB_KV.delete(`${SCHEDULE_PREFIX}${e.id}`)));
    totalRemoved += stale.length;

    // Determine owner: use assigned ownerId, fall back to syncing user
    const eventOwner = cal.ownerId ?? session.userId;

    // Upsert incoming events
    for (const ge of gEvents) {
      const isAllDay = !!ge.start?.date;
      const date = isAllDay ? ge.start.date : ge.start?.dateTime?.slice(0, 10);
      if (!date) continue;

      const id = `gcal_${slug}_${ge.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const record = {
        id,
        owner:            eventOwner,
        visibility:       'shared',
        source:           'google',
        googleId:         ge.id,
        googleCalendarId: cal.id,
        calendarLabel:    cal.summary,
        title:            ge.summary ?? '(No title)',
        date,
        allDay:           isAllDay,
        time:             isAllDay ? null : (ge.start.dateTime?.slice(11, 16) ?? null),
        endTime:          isAllDay ? null : (ge.end?.dateTime?.slice(11, 16) ?? null),
        description:      ge.description ?? '',
        createdAt:        ge.created  ?? new Date().toISOString(),
        updatedAt:        ge.updated  ?? new Date().toISOString(),
      };
      await env.FAMILY_HUB_KV.put(`${SCHEDULE_PREFIX}${id}`, JSON.stringify(record));
      totalSynced++;
    }
  }

  integration.lastSync = new Date().toISOString();
  await env.FAMILY_HUB_KV.put(`integration:google:${session.userId}`, JSON.stringify(integration));

  return Response.json({ synced: totalSynced, removed: totalRemoved, calendars: integration.syncedCalendars.length });
}

// ── Token refresh helper ──────────────────────────────────────────────────────

async function getValidToken(integration, env) {
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
