const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // GET /events — returns combined calendar events
    if (url.pathname === "/events" && request.method === "GET") {
      return handleGetEvents(url, env);
    }

    // GET /debug — check secrets are loaded
    if (url.pathname === "/debug") {
      return json({
        client_id_set: !!env.GOOGLE_CLIENT_ID,
        client_id_prefix: env.GOOGLE_CLIENT_ID?.slice(0, 12),
        secret_set: !!env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
      });
    }

    // GET /auth/google?user=alex or ?user=jen
    if (url.pathname === "/auth/google") {
      return handleGoogleAuth(url, env);
    }

    // GET /auth/google/callback
    if (url.pathname === "/auth/google/callback") {
      return handleGoogleCallback(url, env);
    }

    return json({ error: "Not found" }, 404);
  },
};

// --- Events ---
async function handleGetEvents(url, env) {
  const start = url.searchParams.get("start") || new Date().toISOString();
  const end = url.searchParams.get("end") || new Date(Date.now() + 30 * 86400000).toISOString();

  let events = [];

  // Fetch from Alex's account
  const alexTokensRaw = await env.FAMILY_DATA.get("google_tokens_alex");
  const alexCalendars = JSON.parse(await env.FAMILY_DATA.get("calendar_ids_alex") || "[]");
  if (alexTokensRaw && alexCalendars.length > 0) {
    const tokens = JSON.parse(alexTokensRaw);
    for (const cal of alexCalendars) {
      try {
        const calEvents = await fetchCalendarEvents(cal.id, "alex", cal.name, start, end, tokens, "alex", env);
        events = events.concat(calEvents);
      } catch (e) {
        console.error(`Alex calendar error ${cal.name}:`, e.message);
      }
    }
  }

  // Fetch from Jen's account
  const jenTokensRaw = await env.FAMILY_DATA.get("google_tokens_jen");
  const jenCalendars = JSON.parse(await env.FAMILY_DATA.get("calendar_ids_jen") || "[]");
  if (jenTokensRaw && jenCalendars.length > 0) {
    const tokens = JSON.parse(jenTokensRaw);
    for (const cal of jenCalendars) {
      try {
        const calEvents = await fetchCalendarEvents(cal.id, "wife", cal.name, start, end, tokens, "jen", env);
        events = events.concat(calEvents);
      } catch (e) {
        console.error(`Jen calendar error ${cal.name}:`, e.message);
      }
    }
  }

  // Family calendar name overrides
  const familyCalendars = ["Family", "Holidays in United States"];
  events = events.map(e => ({
    ...e,
    owner: familyCalendars.includes(e.calendar) ? "family" : e.owner,
  }));

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return json({ events });
}

async function fetchCalendarEvents(calendarId, owner, calendarName, start, end, tokens, userKey, env) {
  let accessToken = tokens.access_token;

  if (Date.now() > tokens.expiry_date) {
    accessToken = await refreshAccessToken(tokens.refresh_token, userKey, env);
  }

  const params = new URLSearchParams({
    timeMin: start,
    timeMax: end,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  const data = await res.json();

  return (data.items || []).map(item => ({
    id: item.id,
    title: item.summary || "(No title)",
    start: item.start?.dateTime || item.start?.date,
    end: item.end?.dateTime || item.end?.date,
    allDay: !item.start?.dateTime,
    owner,
    calendar: calendarName,
  }));
}

async function refreshAccessToken(refreshToken, userKey, env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to refresh token");

  const existing = JSON.parse(await env.FAMILY_DATA.get(`google_tokens_${userKey}`) || "{}");
  await env.FAMILY_DATA.put(`google_tokens_${userKey}`, JSON.stringify({
    ...existing,
    access_token: data.access_token,
    expiry_date: Date.now() + data.expires_in * 1000,
  }));

  return data.access_token;
}

// --- Google OAuth ---
function handleGoogleAuth(url, env) {
  const user = url.searchParams.get("user") || "alex";
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent",
    state: user,
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}

async function handleGoogleCallback(url, env) {
  const code = url.searchParams.get("code");
  const user = url.searchParams.get("state") || "alex";
  if (!code) return json({ error: "No code received" }, 400);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      code,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await res.json();
  if (!tokens.access_token) return json({ error: "Token exchange failed", detail: tokens }, 400);

  await env.FAMILY_DATA.put(`google_tokens_${user}`, JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: Date.now() + tokens.expires_in * 1000,
  }));

  // Fetch and store calendars for this user
  const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const calData = await calRes.json();
  const calendars = (calData.items || []).map(c => ({
    id: c.id,
    name: c.summary,
  }));
  await env.FAMILY_DATA.put(`calendar_ids_${user}`, JSON.stringify(calendars));

  const displayName = user === "jen" ? "Jen" : "Alex";
  return new Response(`
    <html><body style="font-family:sans-serif;padding:40px;background:#0f1117;color:#e8eaf6">
      <h2>✅ ${displayName}'s Google Calendar connected!</h2>
      <p>Found ${calendars.length} calendars.</p>
      <ul>${calendars.map(c => `<li>${c.name}</li>`).join("")}</ul>
    </body></html>
  `, { headers: { "Content-Type": "text/html" } });
}
