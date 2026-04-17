const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function tellerFetch(path, env) {
  return fetch(`https://api.teller.io${path}`, {
    headers: { Authorization: `Basic ${btoa(env.TELLER_APP_ID + ":")}` },
    // @ts-ignore
    cf: { mtlsClientCertificate: env.TELLER_CERT },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ---- Calendar ----
    if (url.pathname === "/events" && request.method === "GET") return handleGetEvents(url, env);
    if (url.pathname === "/auth/google") return handleGoogleAuth(url, env);
    if (url.pathname === "/auth/google/callback") return handleGoogleCallback(url, env);

    // ---- Teller / Finance ----
    if (url.pathname === "/finance/connect" && request.method === "POST") return handleTellerConnect(request, env);
    if (url.pathname === "/finance/accounts" && request.method === "GET") return handleGetAccounts(env);
    if (url.pathname === "/finance/transactions" && request.method === "GET") return handleGetTransactions(url, env);
    if (url.pathname === "/finance/summary" && request.method === "GET") return handleGetSummary(url, env);
    if (url.pathname === "/finance/goals" && request.method === "GET") return handleGetGoals(env);
    if (url.pathname === "/finance/goals" && request.method === "POST") return handleSaveGoal(request, env);
    if (url.pathname.startsWith("/finance/goals/") && request.method === "DELETE") return handleDeleteGoal(url, env);
    if (url.pathname === "/finance/manual" && request.method === "POST") return handleManualEntry(request, env);

    // ---- Debug ----
    if (url.pathname === "/debug") {
      const enrollments = JSON.parse(await env.FAMILY_DATA.get("teller_enrollments") || "[]");
      return json({
        client_id_set: !!env.GOOGLE_CLIENT_ID,
        secret_set: !!env.GOOGLE_CLIENT_SECRET,
        teller_app_id_set: !!env.TELLER_APP_ID,
        teller_cert_set: !!env.TELLER_CERT,
        teller_enrollments_count: enrollments.length,
        teller_enrollment_preview: enrollments.map(e => ({ hasToken: !!e.accessToken, tokenPrefix: e.accessToken?.slice(0,8) })),
      });
    }

    return json({ error: "Not found" }, 404);
  },
};

// ================================================================
// TELLER — connect enrollment
// ================================================================
async function handleTellerConnect(request, env) {
  const { accessToken, enrollment } = await request.json();
  if (!accessToken) return json({ error: "Missing accessToken" }, 400);

  const enrollments = JSON.parse(await env.FAMILY_DATA.get("teller_enrollments") || "[]");
  enrollments.push({ accessToken, enrollment, connectedAt: new Date().toISOString() });
  await env.FAMILY_DATA.put("teller_enrollments", JSON.stringify(enrollments));

  return json({ ok: true });
}

// ================================================================
// TELLER — accounts + balances
// ================================================================
async function handleGetAccounts(env) {
  const enrollments = JSON.parse(await env.FAMILY_DATA.get("teller_enrollments") || "[]");

  let accounts = [];

  if (enrollments.length > 0 && env.TELLER_PROXY_URL) {
    try {
      const res = await fetch(`${env.TELLER_PROXY_URL}/accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-secret": env.TELLER_PROXY_SECRET,
        },
        body: JSON.stringify({ enrollments }),
      });
      if (res.ok) {
        const data = await res.json();
        accounts = data.accounts || [];
      }
    } catch (e) {
      console.error("Proxy accounts error:", e.message);
    }
  }

  // Add manual accounts
  const manual = JSON.parse(await env.FAMILY_DATA.get("manual_accounts") || "[]");
  accounts = accounts.concat(manual);

  return json({ accounts, connected: accounts.length > 0 });
}

// ================================================================
// TELLER — transactions
// ================================================================
async function handleGetTransactions(url, env) {
  const accountId = url.searchParams.get("account");
  const enrollments = JSON.parse(await env.FAMILY_DATA.get("teller_enrollments") || "[]");

  let transactions = [];

  if (enrollments.length > 0 && env.TELLER_PROXY_URL) {
    try {
      const res = await fetch(`${env.TELLER_PROXY_URL}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-secret": env.TELLER_PROXY_SECRET,
        },
        body: JSON.stringify({ enrollments, accountId }),
      });
      if (res.ok) {
        const data = await res.json();
        transactions = (data.transactions || []).map(tx => ({
          ...tx,
          category: tx.category || categorize(tx.description),
        }));
      }
    } catch (e) {
      console.error("Proxy transactions error:", e.message);
    }
  }

  // Add manual transactions
  const manual = JSON.parse(await env.FAMILY_DATA.get("manual_transactions") || "[]");
  transactions = transactions.concat(manual);

  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  return json({ transactions });
}

// ================================================================
// SUMMARY — spending by category, monthly trends
// ================================================================
async function handleGetSummary(url, env) {
  const months = parseInt(url.searchParams.get("months") || "3");
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const txRes = await handleGetTransactions(new URL("https://x/finance/transactions"), env);
  const { transactions } = await txRes.json();

  const recent = transactions.filter(tx =>
    tx.type === "debit" && new Date(tx.date) >= cutoff && tx.status !== "pending"
  );

  // Spending by category
  const byCategory = {};
  for (const tx of recent) {
    const cat = tx.category || "Other";
    byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount);
  }

  // Monthly spending
  const byMonth = {};
  for (const tx of recent) {
    const key = tx.date.slice(0, 7); // YYYY-MM
    byMonth[key] = (byMonth[key] || 0) + Math.abs(tx.amount);
  }

  // Quarterly tax estimate (simple: 25% of income transactions)
  const income = transactions
    .filter(tx => tx.type === "credit" && new Date(tx.date) >= cutoff)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const taxEstimate = income * 0.25;

  return json({
    byCategory: Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 })),
    byMonth: Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 })),
    totalSpent: Math.round(recent.reduce((s, t) => s + Math.abs(t.amount), 0) * 100) / 100,
    totalIncome: Math.round(income * 100) / 100,
    taxEstimate: Math.round(taxEstimate * 100) / 100,
  });
}

// ================================================================
// GOALS
// ================================================================
async function handleGetGoals(env) {
  const goals = JSON.parse(await env.FAMILY_DATA.get("budget_goals") || "[]");
  return json({ goals });
}

async function handleSaveGoal(request, env) {
  const goal = await request.json();
  if (!goal.name || !goal.amount) return json({ error: "Missing name or amount" }, 400);
  const goals = JSON.parse(await env.FAMILY_DATA.get("budget_goals") || "[]");
  goal.id = `goal_${Date.now()}`;
  goal.createdAt = new Date().toISOString();
  goals.push(goal);
  await env.FAMILY_DATA.put("budget_goals", JSON.stringify(goals));
  return json({ ok: true, goal });
}

async function handleDeleteGoal(url, env) {
  const id = url.pathname.split("/").pop();
  const goals = JSON.parse(await env.FAMILY_DATA.get("budget_goals") || "[]");
  await env.FAMILY_DATA.put("budget_goals", JSON.stringify(goals.filter(g => g.id !== id)));
  return json({ ok: true });
}

// ================================================================
// MANUAL ENTRY
// ================================================================
async function handleManualEntry(request, env) {
  const body = await request.json();
  const { type, ...data } = body;

  if (type === "transaction") {
    const manual = JSON.parse(await env.FAMILY_DATA.get("manual_transactions") || "[]");
    data.id = `manual_${Date.now()}`;
    data.amount = parseFloat(data.amount);
    data.category = data.category || categorize(data.description || "");
    manual.push(data);
    await env.FAMILY_DATA.put("manual_transactions", JSON.stringify(manual));
    return json({ ok: true });
  }

  if (type === "account") {
    const manual = JSON.parse(await env.FAMILY_DATA.get("manual_accounts") || "[]");
    data.id = `manual_${Date.now()}`;
    data.balance = parseFloat(data.balance);
    data.manual = true;
    manual.push(data);
    await env.FAMILY_DATA.put("manual_accounts", JSON.stringify(manual));
    return json({ ok: true });
  }

  return json({ error: "Invalid type" }, 400);
}

// ================================================================
// AUTO-CATEGORIZATION
// ================================================================
function categorize(description) {
  const d = (description || "").toLowerCase();
  if (/grocery|walmart|kroger|safeway|whole foods|aldi|trader joe/.test(d)) return "Groceries";
  if (/restaurant|mcdonald|starbucks|chick-fil|pizza|taco|subway|doordash|grubhub|uber eats/.test(d)) return "Dining";
  if (/amazon|ebay|target|bestbuy|best buy|shop/.test(d)) return "Shopping";
  if (/gas|shell|exxon|bp|chevron|fuel/.test(d)) return "Gas";
  if (/netflix|spotify|hulu|disney|apple|google play|subscription/.test(d)) return "Subscriptions";
  if (/electric|water|gas bill|utility|internet|comcast|verizon|at&t/.test(d)) return "Utilities";
  if (/mortgage|rent|hoa/.test(d)) return "Housing";
  if (/doctor|hospital|pharmacy|cvs|walgreens|medical|dental|vision/.test(d)) return "Healthcare";
  if (/school|tuition|education/.test(d)) return "Education";
  if (/paypal/.test(d)) return "Online Purchases";
  if (/transfer|zelle|venmo/.test(d)) return "Transfers";
  if (/salary|payroll|direct dep/.test(d)) return "Income";
  return "Other";
}

// ================================================================
// GOOGLE CALENDAR (unchanged)
// ================================================================
async function handleGetEvents(url, env) {
  const start = url.searchParams.get("start") || new Date().toISOString();
  const end = url.searchParams.get("end") || new Date(Date.now() + 30 * 86400000).toISOString();

  let events = [];

  const alexTokensRaw = await env.FAMILY_DATA.get("google_tokens_alex");
  const alexCalendars = JSON.parse(await env.FAMILY_DATA.get("calendar_ids_alex") || "[]");
  if (alexTokensRaw && alexCalendars.length > 0) {
    const tokens = JSON.parse(alexTokensRaw);
    for (const cal of alexCalendars) {
      try {
        const calEvents = await fetchCalendarEvents(cal.id, "alex", cal.name, start, end, tokens, "alex", env);
        events = events.concat(calEvents);
      } catch (e) { console.error(`Alex calendar error ${cal.name}:`, e.message); }
    }
  }

  const jenTokensRaw = await env.FAMILY_DATA.get("google_tokens_jen");
  const jenCalendars = JSON.parse(await env.FAMILY_DATA.get("calendar_ids_jen") || "[]");
  if (jenTokensRaw && jenCalendars.length > 0) {
    const tokens = JSON.parse(jenTokensRaw);
    for (const cal of jenCalendars) {
      try {
        const calEvents = await fetchCalendarEvents(cal.id, "wife", cal.name, start, end, tokens, "jen", env);
        events = events.concat(calEvents);
      } catch (e) { console.error(`Jen calendar error ${cal.name}:`, e.message); }
    }
  }

  const familyCalendars = ["Family", "Holidays in United States"];
  events = events.map(e => ({ ...e, owner: familyCalendars.includes(e.calendar) ? "family" : e.owner }));
  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  return json({ events });
}

async function fetchCalendarEvents(calendarId, owner, calendarName, start, end, tokens, userKey, env) {
  let accessToken = tokens.access_token;
  if (Date.now() > tokens.expiry_date) accessToken = await refreshAccessToken(tokens.refresh_token, userKey, env);

  const params = new URLSearchParams({ timeMin: start, timeMax: end, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to refresh token");
  const existing = JSON.parse(await env.FAMILY_DATA.get(`google_tokens_${userKey}`) || "{}");
  await env.FAMILY_DATA.put(`google_tokens_${userKey}`, JSON.stringify({ ...existing, access_token: data.access_token, expiry_date: Date.now() + data.expires_in * 1000 }));
  return data.access_token;
}

function handleGoogleAuth(url, env) {
  const user = url.searchParams.get("user") || "alex";
  const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI, response_type: "code", scope: "https://www.googleapis.com/auth/calendar.readonly", access_type: "offline", prompt: "consent", state: user });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}

async function handleGoogleCallback(url, env) {
  const code = url.searchParams.get("code");
  const user = url.searchParams.get("state") || "alex";
  if (!code) return json({ error: "No code received" }, 400);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI, code, grant_type: "authorization_code" }),
  });
  const tokens = await res.json();
  if (!tokens.access_token) return json({ error: "Token exchange failed", detail: tokens }, 400);
  await env.FAMILY_DATA.put(`google_tokens_${user}`, JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry_date: Date.now() + tokens.expires_in * 1000 }));
  const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const calData = await calRes.json();
  const calendars = (calData.items || []).map(c => ({ id: c.id, name: c.summary }));
  await env.FAMILY_DATA.put(`calendar_ids_${user}`, JSON.stringify(calendars));
  const displayName = user === "jen" ? "Jen" : "Alex";
  return new Response(`<html><body style="font-family:sans-serif;padding:40px;background:#0f1117;color:#e8eaf6"><h2>✅ ${displayName}'s Google Calendar connected!</h2><p>Found ${calendars.length} calendars.</p><ul>${calendars.map(c => `<li>${c.name}</li>`).join("")}</ul></body></html>`, { headers: { "Content-Type": "text/html" } });
}
