import { handleAuth } from './routes/auth.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(origin);
    }

    let response;

    // Auth routes
    response = await handleAuth(request, env, url.pathname);

    // Unknown route
    if (!response) {
      response = new Response('Not Found', { status: 404 });
    }

    return withCors(response, origin);
  },
};

// ---------------------------------------------------------------------------
// CORS — allow the Pages domain and localhost for local development.
// After `wrangler deploy`, replace the TODO with your actual workers.dev URL
// in public/js/auth.js and Pages will be the allowed origin automatically.
// ---------------------------------------------------------------------------

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === 'null') return false; // file:// — blocked intentionally
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
  // Allow any Cloudflare Pages subdomain
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  const extra = corsHeaders(origin);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
