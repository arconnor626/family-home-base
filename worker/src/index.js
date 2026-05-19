import { handleAuth } from './routes/auth.js';
import { handleSchedule } from './routes/schedule.js';
import { handleFinance } from './routes/finance.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';

    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(origin);
    }

    let response =
      (await handleAuth(request, env, url.pathname)) ??
      (await handleSchedule(request, env, url.pathname)) ??
      (await handleFinance(request, env, url.pathname)) ??
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
