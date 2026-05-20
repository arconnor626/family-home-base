/**
 * Teller integration — bank account connections via Teller Connect.
 *
 * Flow:
 *   1. Frontend loads Teller Connect widget (uses TELLER_APP_ID)
 *   2. User connects their bank → Teller calls onSuccess({ enrollment })
 *   3. Frontend POSTs enrollment to POST /integrations/teller/enroll
 *   4. Worker verifies the token signature, stores the enrollment in KV
 *   5. POST /integrations/teller/sync pulls accounts + transactions via Teller API
 *      and upserts them into the existing finance KV records
 *
 * KV keys:
 *   teller:enrollment:<userId>:<enrollmentId>  — enrollment record (institution, access token)
 *
 * Teller API uses mTLS. Because cf.mtlsClientCert does not work for non-Cloudflare-proxied
 * origins on workers.dev, we use node:https (nodejs_compat flag) with the cert and key
 * stored as Worker secrets: TELLER_CERT_PEM and TELLER_KEY_PEM.
 */

import { requireAuth, unauthorized, badRequest } from '../lib/guard.js';
import { listRecords, putRecord, deleteRecord } from '../lib/records.js';

const TELLER_API = 'https://api.teller.io';
const ENROLL_PREFIX = 'teller:enrollment:';

export async function handleTeller(request, env, pathname) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const method = request.method;

  if (pathname === '/integrations/teller/enrollments' && method === 'GET')  return listEnrollments(env, session);
  if (pathname === '/integrations/teller/enroll'       && method === 'POST') return enroll(request, env, session);
  if (pathname === '/integrations/teller/sync'         && method === 'POST') return sync(request, env, session);
  if (pathname.match(/^\/integrations\/teller\/enrollments\/([^/]+)$/) && method === 'DELETE') {
    return unenroll(request, env, session, pathname.match(/^\/integrations\/teller\/enrollments\/([^/]+)$/)[1]);
  }

  return null;
}

// ── Teller API helper (via Railway relay) ─────────────────────────────────────
//
// Cloudflare Workers cannot make outbound mTLS requests to arbitrary
// third-party APIs — cf.mtlsClientCert and node:https cert/key options
// are both unsupported for non-Cloudflare-proxied origins.
//
// Instead we forward requests to a tiny Node.js relay deployed on Railway
// (family-home-base/teller-proxy/) which handles the mTLS handshake.
//
// Required Worker secrets:
//   TELLER_PROXY_URL    — e.g. https://teller-proxy-xxxx.up.railway.app
//   TELLER_PROXY_SECRET — shared secret matching the relay's PROXY_SECRET env var

async function tellerFetch(env, accessToken, path, method = 'GET') {
  const proxyUrl    = env.TELLER_PROXY_URL;
  const proxySecret = env.TELLER_PROXY_SECRET;

  if (!proxyUrl || !proxySecret) {
    throw new Error(
      'TELLER_PROXY_URL and TELLER_PROXY_SECRET Worker secrets are required. ' +
      'Deploy teller-proxy/ on Railway, then set these secrets with wrangler secret put.'
    );
  }

  const res = await fetch(`${proxyUrl}/relay`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${proxySecret}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ path, accessToken, method }),
  });

  return {
    ok:     res.ok,
    status: res.status,
    statusText: res.statusText,
    json:   () => res.json(),
    text:   () => res.text(),
  };
}

// ── List enrollments ──────────────────────────────────────────────────────────

async function listEnrollments(env, session) {
  const prefix = `${ENROLL_PREFIX}${session.userId}:`;
  const enrollments = await listRecords(env.FAMILY_HUB_KV, prefix);
  // Strip access tokens from response
  return Response.json(enrollments.map(({ accessToken: _t, ...pub }) => pub));
}

// ── Enroll a new bank connection ──────────────────────────────────────────────

async function enroll(request, env, session) {
  const body = await request.json().catch(() => null);
  if (!body?.accessToken || !body?.enrollment) return badRequest('accessToken and enrollment required');

  const { accessToken, enrollment } = body;

  // Verify the enrollment token signature using the Ed25519 signing key
  // Teller signs the token so we know it came from a real Teller Connect session
  if (env.TELLER_TOKEN_SIGNING_KEY) {
    try {
      await verifyEnrollmentToken(accessToken, env.TELLER_TOKEN_SIGNING_KEY);
    } catch (e) {
      return Response.json({ error: 'Token verification failed: ' + e.message }, { status: 401 });
    }
  }

  // Fetch institution details + initial accounts from Teller
  const accountsRes = await tellerFetch(env, accessToken, '/accounts');
  if (!accountsRes.ok) {
    const errText = await accountsRes.text().catch(() => '');
    let errJson = {};
    try { errJson = JSON.parse(errText); } catch (_) {}
    console.error(`[teller] /accounts failed: ${accountsRes.status} ${accountsRes.statusText}`, errText);
    return Response.json({ error: 'Teller API error fetching accounts', detail: errJson, status: accountsRes.status }, { status: 502 });
  }
  const tellerAccounts = await accountsRes.json();

  const enrollmentRecord = {
    id:            enrollment.id,
    owner:         session.userId,
    visibility:    'shared',
    createdAt:     new Date().toISOString(),
    accessToken,                         // stored server-side only, never sent to frontend
    institution:   enrollment.institution,
    accounts:      tellerAccounts.map(a => ({
      id:          a.id,
      name:        a.name,
      type:        a.type,
      subtype:     a.subtype,
      status:      a.status,
      currency:    a.currency,
      last_four:   a.last_four,
      institution: a.institution?.name ?? enrollment.institution?.name,
    })),
    lastSync:      null,
  };

  const key = `${ENROLL_PREFIX}${session.userId}:${enrollment.id}`;
  await env.FAMILY_HUB_KV.put(key, JSON.stringify(enrollmentRecord));

  const { accessToken: _t, ...pub } = enrollmentRecord;
  return Response.json(pub, { status: 201 });
}

// ── Unenroll ──────────────────────────────────────────────────────────────────

async function unenroll(request, env, session, enrollmentId) {
  const key = `${ENROLL_PREFIX}${session.userId}:${enrollmentId}`;
  const raw = await env.FAMILY_HUB_KV.get(key);
  if (!raw) return Response.json({ error: 'Enrollment not found' }, { status: 404 });
  const record = JSON.parse(raw);
  if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
  await deleteRecord(env.FAMILY_HUB_KV, key);
  return new Response(null, { status: 204 });
}

// ── Sync accounts + transactions ──────────────────────────────────────────────

async function sync(request, env, session) {
  // Optionally sync only a specific enrollment
  const body = await request.json().catch(() => ({}));
  const prefix = `${ENROLL_PREFIX}${session.userId}:`;
  const allEnrollments = await listRecords(env.FAMILY_HUB_KV, prefix);

  const toSync = body?.enrollmentId
    ? allEnrollments.filter(e => e.id === body.enrollmentId)
    : allEnrollments;

  if (!toSync.length) return Response.json({ error: 'No enrolled accounts to sync.' }, { status: 400 });

  let syncedAccounts = 0, syncedTransactions = 0;

  for (const enrollment of toSync) {
    const result = await syncEnrollment(env, session, enrollment);
    syncedAccounts     += result.accounts;
    syncedTransactions += result.transactions;

    // Update lastSync on the enrollment record
    enrollment.lastSync = new Date().toISOString();
    const key = `${ENROLL_PREFIX}${session.userId}:${enrollment.id}`;
    await env.FAMILY_HUB_KV.put(key, JSON.stringify(enrollment));
  }

  return Response.json({ syncedAccounts, syncedTransactions, enrollments: toSync.length });
}

async function syncEnrollment(env, session, enrollment) {
  let accountCount = 0, txCount = 0;

  for (const tellerAcct of enrollment.accounts ?? []) {
    if (tellerAcct.status !== 'open') continue;

    // ── Account balance ───────────────────────────────────────────────────────
    const balRes = await tellerFetch(env, enrollment.accessToken, `/accounts/${tellerAcct.id}/balances`);
    if (balRes.ok) {
      const bal = await balRes.json();
      const balance = parseFloat(bal.available ?? bal.ledger ?? 0);

      // Map Teller account type to our internal type
      const acctType = mapAccountType(tellerAcct.type, tellerAcct.subtype);
      const acctId   = `teller_${tellerAcct.id}`;

      const acctRecord = {
        id:          acctId,
        owner:       session.userId,
        visibility:  'shared',
        source:      'teller',
        tellerId:    tellerAcct.id,
        name:        `${tellerAcct.name}${tellerAcct.last_four ? ' ···' + tellerAcct.last_four : ''}`,
        institution: tellerAcct.institution ?? enrollment.institution?.name ?? '',
        type:        acctType,
        balance:     ['credit', 'loan'].includes(acctType) ? -Math.abs(balance) : balance,
        currency:    tellerAcct.currency ?? 'USD',
        createdAt:   enrollment.createdAt,
        updatedAt:   new Date().toISOString(),
      };
      await putRecord(env.FAMILY_HUB_KV, `finance:account:${acctId}`, acctRecord);
      accountCount++;
    }

    // ── Transactions (last 90 days) ───────────────────────────────────────────
    const txRes = await tellerFetch(env, enrollment.accessToken, `/accounts/${tellerAcct.id}/transactions`);
    if (txRes.ok) {
      const txList = await txRes.json();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      for (const tx of txList) {
        if (tx.date < cutoffStr) continue;
        const txId = `teller_${tx.id}`;
        const amount = Math.abs(parseFloat(tx.amount));
        // Teller: negative amount = debit (money out), positive = credit (money in)
        const txType = parseFloat(tx.amount) < 0 ? 'debit' : 'credit';

        const txRecord = {
          id:          txId,
          owner:       session.userId,
          visibility:  'shared',
          source:      'teller',
          tellerId:    tx.id,
          date:        tx.date,
          description: tx.description,
          amount,
          type:        txType,
          category:    tx.details?.category ?? tx.category ?? '',
          accountId:   `teller_${tellerAcct.id}`,
          status:      tx.status,
          createdAt:   tx.created_at ?? new Date().toISOString(),
          updatedAt:   new Date().toISOString(),
        };
        await putRecord(env.FAMILY_HUB_KV, `finance:transaction:${txId}`, txRecord);
        txCount++;
      }
    }
  }

  return { accounts: accountCount, transactions: txCount };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAccountType(type, subtype) {
  if (type === 'credit') return 'credit';
  if (type === 'loan')   return 'loan';
  if (subtype === 'savings') return 'depository';
  if (subtype === 'checking') return 'depository';
  if (type === 'investment') return 'investment';
  return 'depository';
}

async function verifyEnrollmentToken(token, signingKeyBase64) {
  // Teller signs access tokens with Ed25519.
  // The signing key is a base64-encoded raw public key.
  // Token format: <data>.<signature> (base64url-encoded parts)
  const parts = token.split('.');
  if (parts.length < 2) throw new Error('Invalid token format');

  const keyBytes = base64ToBytes(signingKeyBase64);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'Ed25519' }, false, ['verify'],
  );

  const data      = new TextEncoder().encode(parts.slice(0, -1).join('.'));
  const signature = base64UrlToBytes(parts[parts.length - 1]);

  const valid = await crypto.subtle.verify('Ed25519', cryptoKey, signature, data);
  if (!valid) throw new Error('Signature invalid');
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function base64UrlToBytes(b64url) {
  return base64ToBytes(b64url.replace(/-/g, '+').replace(/_/g, '/'));
}
