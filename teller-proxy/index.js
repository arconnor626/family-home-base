/**
 * Teller mTLS relay — deployed on Railway.
 *
 * Cloudflare Workers cannot make outbound mTLS requests to arbitrary
 * third-party APIs. This tiny server runs in a full Node.js environment,
 * handles the mTLS handshake with Teller, and relays the response back
 * to the Cloudflare Worker.
 *
 * Environment variables (set in Railway dashboard):
 *   TELLER_CERT_PEM  — contents of certificate.pem
 *   TELLER_KEY_PEM   — contents of private_key.pem
 *   PROXY_SECRET     — a secret string; the Worker sends this to authenticate
 *   PORT             — set automatically by Railway
 */

import https from 'node:https';
import http  from 'node:http';

const TELLER_HOST   = 'api.teller.io';
const PROXY_SECRET  = process.env.PROXY_SECRET;
const CERT_PEM      = process.env.TELLER_CERT_PEM;
const KEY_PEM       = process.env.TELLER_KEY_PEM;
const PORT          = parseInt(process.env.PORT ?? '3000', 10);

if (!CERT_PEM || !KEY_PEM) {
  console.error('TELLER_CERT_PEM and TELLER_KEY_PEM must be set.');
  process.exit(1);
}
if (!PROXY_SECRET) {
  console.error('PROXY_SECRET must be set.');
  process.exit(1);
}

// ── Request handler ──────────────────────────────────────────────────────────

function handleRequest(req, res) {
  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // All relay calls must be POST /relay
  if (req.url !== '/relay' || req.method !== 'POST') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Authenticate using shared secret
  const auth = req.headers['authorization'] ?? '';
  if (auth !== `Bearer ${PROXY_SECRET}`) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  // Read request body
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    const { path, accessToken, method = 'GET' } = parsed;
    if (!path || !accessToken) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'path and accessToken are required' }));
      return;
    }

    const credentials = Buffer.from(`${accessToken}:`).toString('base64');

    // Forward the request to Teller with mTLS
    const options = {
      hostname: TELLER_HOST,
      path,
      method,
      cert: CERT_PEM,
      key:  KEY_PEM,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept':        'application/json',
      },
    };

    const tellerReq = https.request(options, tellerRes => {
      let data = '';
      tellerRes.on('data', chunk => { data += chunk; });
      tellerRes.on('end', () => {
        res.writeHead(tellerRes.statusCode, {
          'Content-Type': 'application/json',
          'X-Teller-Status': String(tellerRes.statusCode),
        });
        res.end(data);
      });
    });

    tellerReq.on('error', err => {
      console.error('Teller request error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream error: ' + err.message }));
    });

    tellerReq.end();
  });
}

// ── Start server ─────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`Teller relay listening on port ${PORT}`);
});
