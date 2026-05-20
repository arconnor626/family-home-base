import { handleAuth } from './routes/auth.js';
import { handleAdmin } from './routes/admin.js';
import { handleSchedule } from './routes/schedule.js';
import { handleFinance } from './routes/finance.js';
import { handleBudgetCategories } from './routes/budgetCategories.js';
import { handleTasks } from './routes/tasks.js';
import { handleProjects } from './routes/projects.js';
import { handleNotes } from './routes/notes.js';
import { handleIntegrations } from './routes/integrations.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';

    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(origin);
    }

    // OAuth callbacks arrive as plain browser redirects with no Authorization header.
    // Handle them before the handler chain so auth-gated handlers don't intercept them.
    if (url.pathname === '/integrations/google/callback') {
      return withCors(await handleIntegrations(request, env, url.pathname), origin);
    }

    let response =
      (await handleAuth(request, env, url.pathname)) ??
      (await handleAdmin(request, env, url.pathname)) ??
      (await handleSchedule(request, env, url.pathname)) ??
      (await handleBudgetCategories(request, env, url.pathname)) ??
      (await handleFinance(request, env, url.pathname)) ??
      (await handleTasks(request, env, url.pathname)) ??
      (await handleProjects(request, env, url.pathname)) ??
      (await handleNotes(request, env, url.pathname)) ??
      (await handleIntegrations(request, env, url.pathname)) ??
      new Response('Not Found', { status: 404 });

    return withCors(response, origin);
  },
};

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return false;
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
  if (origin.endsWith('.pages.dev')) return true;
  return false;
}

function corsHeaders(origin) {
  if (!isAllowedOrigin(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

function corsPreflightResponse(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
