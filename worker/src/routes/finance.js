import { requireAuth, unauthorized, notFound, badRequest } from '../lib/guard.js';
import { listRecords, getRecord, putRecord, deleteRecord, newRecord } from '../lib/records.js';

const ACCT_PREFIX = 'finance:account:';
const TX_PREFIX   = 'finance:transaction:';
const GOAL_PREFIX = 'finance:goal:';

export async function handleFinance(request, env, pathname) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const kv = env.FAMILY_HUB_KV;
  const method = request.method;

  // ── Accounts ────────────────────────────────────────────────────────────────

  if (pathname === '/finance/accounts') {
    if (method === 'GET') {
      const records = await listRecords(kv, ACCT_PREFIX);
      const visible = records.filter(r => r.visibility === 'shared' || r.owner === session.userId);
      return Response.json(visible);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.name || body?.balance === undefined) return badRequest('name and balance are required');
      const record = newRecord(
        {
          name: String(body.name).trim(),
          institution: body.institution ? String(body.institution).trim() : '',
          type: ['depository', 'investment', 'credit', 'loan'].includes(body.type) ? body.type : 'depository',
          balance: Number(body.balance),
          visibility: body.visibility === 'private' ? 'private' : 'shared',
          updatedAt: new Date().toISOString(),
        },
        session.userId
      );
      await putRecord(kv, `${ACCT_PREFIX}${record.id}`, record);
      return Response.json(record, { status: 201 });
    }
  }

  const acctMatch = pathname.match(/^\/finance\/accounts\/([^/]+)$/);
  if (acctMatch) {
    const key = `${ACCT_PREFIX}${acctMatch[1]}`;
    const record = await getRecord(kv, key);
    if (!record) return notFound();

    if (method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Request body required');
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const updated = {
        ...record,
        name: body.name ? String(body.name).trim() : record.name,
        institution: body.institution !== undefined ? String(body.institution).trim() : record.institution,
        type: ['depository', 'investment', 'credit', 'loan'].includes(body.type) ? body.type : record.type,
        balance: body.balance !== undefined ? Number(body.balance) : record.balance,
        visibility: body.visibility === 'private' ? 'private' : (body.visibility === 'shared' ? 'shared' : record.visibility),
        updatedAt: new Date().toISOString(),
      };
      await putRecord(kv, key, updated);
      return Response.json(updated);
    }
    if (method === 'DELETE') {
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      await deleteRecord(kv, key);
      return new Response(null, { status: 204 });
    }
  }

  // ── Transactions ─────────────────────────────────────────────────────────────

  if (pathname === '/finance/transactions') {
    if (method === 'GET') {
      const records = await listRecords(kv, TX_PREFIX);
      const visible = records.filter(r => r.visibility === 'shared' || r.owner === session.userId);
      // Sort newest first
      visible.sort((a, b) => new Date(b.date) - new Date(a.date));
      return Response.json(visible);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.description || !body?.date || body?.amount === undefined) {
        return badRequest('description, date, and amount are required');
      }
      const record = newRecord(
        {
          date: String(body.date),
          description: String(body.description).trim(),
          amount: Number(body.amount),
          type: body.type === 'credit' ? 'credit' : 'debit',
          category: body.category ? String(body.category).trim() : '',
          accountId: body.accountId ? String(body.accountId) : null,
          visibility: body.visibility === 'private' ? 'private' : 'shared',
        },
        session.userId
      );
      await putRecord(kv, `${TX_PREFIX}${record.id}`, record);
      return Response.json(record, { status: 201 });
    }
  }

  const txMatch = pathname.match(/^\/finance\/transactions\/([^/]+)$/);
  if (txMatch) {
    const key = `${TX_PREFIX}${txMatch[1]}`;
    const record = await getRecord(kv, key);
    if (!record) return notFound();
    if (method === 'DELETE') {
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      await deleteRecord(kv, key);
      return new Response(null, { status: 204 });
    }
  }

  // ── Goals ────────────────────────────────────────────────────────────────────

  if (pathname === '/finance/goals') {
    if (method === 'GET') {
      const records = await listRecords(kv, GOAL_PREFIX);
      const visible = records.filter(r => r.visibility === 'shared' || r.owner === session.userId);
      return Response.json(visible);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.name || body?.target === undefined) return badRequest('name and target are required');
      const record = newRecord(
        {
          name: String(body.name).trim(),
          target: Number(body.target),
          current: Number(body.current ?? 0),
          category: body.category ? String(body.category).trim() : '',
          targetDate: body.targetDate ? String(body.targetDate) : null,
          visibility: body.visibility === 'private' ? 'private' : 'shared',
        },
        session.userId
      );
      await putRecord(kv, `${GOAL_PREFIX}${record.id}`, record);
      return Response.json(record, { status: 201 });
    }
  }

  const goalMatch = pathname.match(/^\/finance\/goals\/([^/]+)$/);
  if (goalMatch) {
    const key = `${GOAL_PREFIX}${goalMatch[1]}`;
    const record = await getRecord(kv, key);
    if (!record) return notFound();

    if (method === 'PUT') {
      const body = await request.json().catch(() => null);
      if (!body) return badRequest('Request body required');
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      const updated = {
        ...record,
        name: body.name ? String(body.name).trim() : record.name,
        target: body.target !== undefined ? Number(body.target) : record.target,
        current: body.current !== undefined ? Number(body.current) : record.current,
        category: body.category !== undefined ? String(body.category).trim() : record.category,
        targetDate: body.targetDate !== undefined ? (body.targetDate || null) : record.targetDate,
        updatedAt: new Date().toISOString(),
      };
      await putRecord(kv, key, updated);
      return Response.json(updated);
    }
    if (method === 'DELETE') {
      if (record.owner !== session.userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      await deleteRecord(kv, key);
      return new Response(null, { status: 204 });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  if (pathname === '/finance/summary' && method === 'GET') {
    const [accounts, transactions] = await Promise.all([
      listRecords(kv, ACCT_PREFIX),
      listRecords(kv, TX_PREFIX),
    ]);

    const visibleAccounts = accounts.filter(r => r.visibility === 'shared' || r.owner === session.userId);
    const visibleTx = transactions.filter(r => r.visibility === 'shared' || r.owner === session.userId);

    const totalAssets = visibleAccounts
      .filter(a => a.type !== 'credit' && a.type !== 'loan')
      .reduce((s, a) => s + a.balance, 0);
    const totalDebt = visibleAccounts
      .filter(a => a.type === 'credit' || a.type === 'loan')
      .reduce((s, a) => s + Math.abs(a.balance), 0);
    const netWorth = totalAssets - totalDebt;

    // Monthly spending: current calendar month, debit transactions
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthlySpending = visibleTx
      .filter(t => t.type === 'debit' && t.date >= monthStart)
      .reduce((s, t) => s + Math.abs(t.amount), 0);

    // Quarterly income for tax estimate (last 3 months of credits)
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);
    const quarterlyIncome = visibleTx
      .filter(t => t.type === 'credit' && t.date >= threeMonthsAgoStr)
      .reduce((s, t) => s + t.amount, 0);

    return Response.json({
      netWorth,
      totalAssets,
      totalDebt,
      monthlySpending,
      quarterlyIncome,
      estimatedTax: quarterlyIncome * 0.25,
    });
  }

  return null;
}
