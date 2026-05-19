import { requireAuth, logout, getToken } from '/js/auth.js';

// ── Bootstrap ────────────────────────────────────────────────────────────────

const user = await requireAuth();
if (!user) throw new Error('not authenticated');

const WORKER_URL = (() => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8787';
  return 'https://connor-family-hub.arconnor626.workers.dev';
})();

function authHeaders() {
  return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

async function api(method, path, body) {
  const res = await fetch(WORKER_URL + path, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  return res.json();
}

// ── Header ────────────────────────────────────────────────────────────────────

document.getElementById('user-greeting').textContent = `Hi, ${user.name}`;
document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('current-date').textContent =
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

if (user.role === 'admin') {
  document.getElementById('admin-nav-btn').classList.remove('hidden');
}

// ── View toggle ───────────────────────────────────────────────────────────────

// viewMode is 'family' or a userId string (e.g. 'user:alex')
let viewMode = 'family';

async function initViewSelect() {
  const data = await api('GET', '/users');
  const users = Array.isArray(data) ? data : [];
  const select = document.getElementById('view-select');
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    select.appendChild(opt);
  });
}

document.getElementById('view-select').addEventListener('change', e => {
  viewMode = e.target.value;
  renderCalendar();
  renderToday();
  if (financeLoaded) {
    renderAccounts();
    renderTransactions();
    renderGoals();
  }
});

// ── View filters ──────────────────────────────────────────────────────────────

function visibleEvents() {
  if (viewMode === 'family') return allEvents.filter(e => e.visibility === 'shared');
  return allEvents.filter(e => e.owner === viewMode);
}

function visibleAccounts() {
  if (viewMode === 'family') return allAccounts.filter(a => a.visibility === 'shared');
  return allAccounts.filter(a => a.owner === viewMode);
}

function visibleTransactions() {
  if (viewMode === 'family') return allTransactions.filter(t => t.visibility === 'shared');
  return allTransactions.filter(t => t.owner === viewMode);
}

function visibleGoals() {
  if (viewMode === 'family') return allGoals.filter(g => g.visibility === 'shared');
  return allGoals.filter(g => g.owner === viewMode);
}

// ── Navigation ────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.section).classList.add('active');
    if (btn.dataset.section === 'finance') loadFinance();
    if (btn.dataset.section === 'admin') loadUsers();
  });
});

// ── Modal helpers ─────────────────────────────────────────────────────────────

const overlay = document.getElementById('modal-overlay');

function openModal(id) {
  overlay.classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  overlay.classList.add('hidden');
  document.getElementById(id).classList.add('hidden');
}

overlay.addEventListener('click', e => {
  if (e.target === overlay) {
    ['event-modal', 'goal-modal', 'manual-modal', 'user-modal'].forEach(closeModal);
  }
});

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function privateBadge(record) {
  return record.visibility === 'private' ? '<span class="badge private-badge">private</span>' : '';
}

// ── SCHEDULE ──────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let weekOffset = 0;
let allEvents = [];

async function loadEvents() {
  const data = await api('GET', '/schedule/events');
  allEvents = Array.isArray(data) ? data : [];
  renderCalendar();
  renderToday();
}

function weekStart(offset) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const start = weekStart(weekOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  document.getElementById('week-label').textContent =
    `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayStr = toDateStr(new Date());
  const events = visibleEvents();

  grid.innerHTML = days.map(day => {
    const dateStr = toDateStr(day);
    const dayEvents = events.filter(e => e.date === dateStr);
    const isToday = dateStr === todayStr;
    return `
      <div class="cal-day ${isToday ? 'today' : ''}">
        <div class="cal-day-header">
          <span class="cal-day-name">${DAYS[day.getDay()]}</span>
          <span class="cal-day-num">${day.getDate()}</span>
        </div>
        <div class="cal-events">
          ${dayEvents.map(e => `
            <div class="cal-event" data-id="${e.id}">
              ${e.allDay ? '' : `<span class="event-time">${e.time || ''}</span>`}
              <span class="event-title">${e.title}</span>
              ${privateBadge(e)}
              <button class="event-delete btn-icon" data-id="${e.id}" title="Delete">×</button>
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.event-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this event?')) return;
      await api('DELETE', `/schedule/events/${btn.dataset.id}`);
      allEvents = allEvents.filter(ev => ev.id !== btn.dataset.id);
      renderCalendar();
      renderToday();
    });
  });
}

function renderToday() {
  const todayStr = toDateStr(new Date());
  const todayEvents = visibleEvents()
    .filter(e => e.date === todayStr)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const el = document.getElementById('today-events');
  if (!todayEvents.length) {
    el.innerHTML = '<p class="empty-msg">Nothing scheduled today.</p>';
    return;
  }
  el.innerHTML = todayEvents.map(e => `
    <div class="today-event">
      <span class="event-dot"></span>
      <div>
        <strong>${e.title}</strong>
        ${privateBadge(e)}
        ${e.allDay ? '<span class="badge">all day</span>' : (e.time ? `<span class="event-time">${e.time}${e.endTime ? ' – ' + e.endTime : ''}</span>` : '')}
        ${e.description ? `<div class="event-desc">${e.description}</div>` : ''}
      </div>
    </div>
  `).join('');
}

document.getElementById('prev-week').addEventListener('click', () => { weekOffset--; renderCalendar(); });
document.getElementById('next-week').addEventListener('click', () => { weekOffset++; renderCalendar(); });

let editingEventId = null;

document.getElementById('add-event-btn').addEventListener('click', () => {
  editingEventId = null;
  document.getElementById('event-modal-title').textContent = 'Add Event';
  document.getElementById('event-title').value = '';
  document.getElementById('event-date').value = toDateStr(new Date());
  document.getElementById('event-allday').checked = true;
  document.getElementById('event-time-fields').classList.add('hidden');
  document.getElementById('event-time').value = '';
  document.getElementById('event-end-time').value = '';
  document.getElementById('event-description').value = '';
  document.getElementById('event-visibility').value = 'shared';
  openModal('event-modal');
});

document.getElementById('event-allday').addEventListener('change', e => {
  document.getElementById('event-time-fields').classList.toggle('hidden', e.target.checked);
});

document.getElementById('event-cancel').addEventListener('click', () => closeModal('event-modal'));

document.getElementById('event-save').addEventListener('click', async () => {
  const title = document.getElementById('event-title').value.trim();
  const date = document.getElementById('event-date').value;
  if (!title || !date) { alert('Title and date are required.'); return; }

  const allDay = document.getElementById('event-allday').checked;
  const body = {
    title, date, allDay,
    time: allDay ? null : (document.getElementById('event-time').value || null),
    endTime: allDay ? null : (document.getElementById('event-end-time').value || null),
    description: document.getElementById('event-description').value.trim(),
    visibility: document.getElementById('event-visibility').value,
  };

  if (editingEventId) {
    const updated = await api('PUT', `/schedule/events/${editingEventId}`, body);
    allEvents = allEvents.map(e => e.id === editingEventId ? updated : e);
  } else {
    const created = await api('POST', '/schedule/events', body);
    allEvents.push(created);
  }
  closeModal('event-modal');
  renderCalendar();
  renderToday();
});

// ── FINANCE ───────────────────────────────────────────────────────────────────

let allAccounts = [];
let allTransactions = [];
let allGoals = [];
let financeLoaded = false;

async function loadFinance() {
  if (financeLoaded) return;
  financeLoaded = true;
  const [accounts, transactions, goals, summary] = await Promise.all([
    api('GET', '/finance/accounts'),
    api('GET', '/finance/transactions'),
    api('GET', '/finance/goals'),
    api('GET', '/finance/summary'),
  ]);
  allAccounts = Array.isArray(accounts) ? accounts : [];
  allTransactions = Array.isArray(transactions) ? transactions : [];
  allGoals = Array.isArray(goals) ? goals : [];
  renderSummary(summary);
  renderAccounts();
  renderTransactions();
  renderGoals();
}

function renderSummary(s) {
  if (!s) return;
  document.getElementById('net-worth').textContent = fmt(s.netWorth);
  document.getElementById('total-assets').textContent = fmt(s.totalAssets);
  document.getElementById('total-debt').textContent = fmt(s.totalDebt);
  document.getElementById('monthly-spending').textContent = fmt(s.monthlySpending);
  document.getElementById('tax-income').textContent = fmt(s.quarterlyIncome);
  document.getElementById('tax-owed').textContent = fmt(s.estimatedTax);
}

function renderAccounts() {
  const el = document.getElementById('accounts-list');
  const accounts = visibleAccounts();
  if (!accounts.length) { el.innerHTML = '<p class="empty-msg">No accounts yet.</p>'; return; }
  el.innerHTML = accounts.map(a => `
    <div class="account-card">
      <div class="account-info">
        <strong>${a.name} ${privateBadge(a)}</strong>
        <span class="account-meta">${a.institution || ''} · ${a.type}</span>
      </div>
      <div class="account-balance ${a.type === 'credit' || a.type === 'loan' ? 'negative' : ''}">${fmt(a.balance)}</div>
      <button class="btn-icon delete-acct" data-id="${a.id}" title="Delete">×</button>
    </div>
  `).join('');
  el.querySelectorAll('.delete-acct').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this account?')) return;
      await api('DELETE', `/finance/accounts/${btn.dataset.id}`);
      allAccounts = allAccounts.filter(a => a.id !== btn.dataset.id);
      renderAccounts();
      refreshSummary();
    });
  });
}

function renderTransactions() {
  const search = document.getElementById('tx-search').value.toLowerCase();
  const cat = document.getElementById('tx-category-filter').value;
  const base = visibleTransactions();
  const filtered = base.filter(t =>
    (!search || t.description.toLowerCase().includes(search)) &&
    (!cat || t.category === cat)
  );

  // Rebuild category options from current visible set
  const cats = [...new Set(base.map(t => t.category).filter(Boolean))].sort();
  const catFilter = document.getElementById('tx-category-filter');
  const currentCat = catFilter.value;
  catFilter.innerHTML = '<option value="">All categories</option>' +
    cats.map(c => `<option value="${c}" ${c === currentCat ? 'selected' : ''}>${c}</option>`).join('');

  const el = document.getElementById('transactions-list');
  if (!filtered.length) { el.innerHTML = '<p class="empty-msg">No transactions.</p>'; return; }

  el.innerHTML = filtered.slice(0, 50).map(t => `
    <div class="tx-row">
      <span class="tx-date">${t.date}</span>
      <div class="tx-desc">
        <span>${t.description} ${privateBadge(t)}</span>
        ${t.category ? `<span class="tx-cat">${t.category}</span>` : ''}
      </div>
      <span class="tx-amount ${t.type === 'credit' ? 'income' : 'expense'}">
        ${t.type === 'credit' ? '+' : '−'}${fmt(Math.abs(t.amount))}
      </span>
      <button class="btn-icon delete-tx" data-id="${t.id}" title="Delete">×</button>
    </div>
  `).join('');
  el.querySelectorAll('.delete-tx').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this transaction?')) return;
      await api('DELETE', `/finance/transactions/${btn.dataset.id}`);
      allTransactions = allTransactions.filter(t => t.id !== btn.dataset.id);
      renderTransactions();
      refreshSummary();
    });
  });
}

document.getElementById('tx-search').addEventListener('input', renderTransactions);
document.getElementById('tx-category-filter').addEventListener('change', renderTransactions);

function renderGoals() {
  const el = document.getElementById('goals-list');
  const goals = visibleGoals();
  if (!goals.length) { el.innerHTML = '<p class="empty-msg">No goals yet.</p>'; return; }
  el.innerHTML = goals.map(g => {
    const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
    return `
      <div class="goal-card">
        <div class="goal-header">
          <span><strong>${g.name}</strong> ${privateBadge(g)}</span>
          <span>${pct.toFixed(0)}%</span>
        </div>
        <div class="goal-bar"><div class="goal-fill" style="width:${pct}%"></div></div>
        <div class="goal-amounts">
          <span>${fmt(g.current)}</span><span>of ${fmt(g.target)}</span>
        </div>
        <button class="btn-icon delete-goal" data-id="${g.id}" title="Delete">×</button>
      </div>`;
  }).join('');
  el.querySelectorAll('.delete-goal').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this goal?')) return;
      await api('DELETE', `/finance/goals/${btn.dataset.id}`);
      allGoals = allGoals.filter(g => g.id !== btn.dataset.id);
      renderGoals();
    });
  });
}

async function refreshSummary() {
  const s = await api('GET', '/finance/summary');
  renderSummary(s);
}

// Goal modal
document.getElementById('add-goal-btn').addEventListener('click', () => {
  document.getElementById('goal-name').value = '';
  document.getElementById('goal-target').value = '';
  document.getElementById('goal-current').value = '0';
  document.getElementById('goal-category').value = '';
  document.getElementById('goal-date').value = '';
  document.getElementById('goal-visibility').value = 'shared';
  openModal('goal-modal');
});
document.getElementById('goal-cancel').addEventListener('click', () => closeModal('goal-modal'));
document.getElementById('goal-save').addEventListener('click', async () => {
  const name = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  if (!name || isNaN(target)) { alert('Name and target amount are required.'); return; }
  const created = await api('POST', '/finance/goals', {
    name, target,
    current: parseFloat(document.getElementById('goal-current').value) || 0,
    category: document.getElementById('goal-category').value.trim(),
    targetDate: document.getElementById('goal-date').value || null,
    visibility: document.getElementById('goal-visibility').value,
  });
  allGoals.push(created);
  closeModal('goal-modal');
  renderGoals();
});

// Manual entry modal
document.getElementById('manual-entry-btn').addEventListener('click', () => {
  document.getElementById('manual-date').value = toDateStr(new Date());
  document.getElementById('manual-desc').value = '';
  document.getElementById('manual-amount').value = '';
  document.getElementById('manual-category').value = '';
  document.getElementById('manual-acct-name').value = '';
  document.getElementById('manual-acct-inst').value = '';
  document.getElementById('manual-acct-balance').value = '';
  document.getElementById('manual-visibility').value = 'shared';
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.toggle-btn[data-type="transaction"]').classList.add('active');
  document.getElementById('manual-tx-fields').classList.remove('hidden');
  document.getElementById('manual-acct-fields').classList.add('hidden');
  openModal('manual-modal');
});

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isTx = btn.dataset.type === 'transaction';
    document.getElementById('manual-tx-fields').classList.toggle('hidden', !isTx);
    document.getElementById('manual-acct-fields').classList.toggle('hidden', isTx);
  });
});

document.getElementById('manual-cancel').addEventListener('click', () => closeModal('manual-modal'));
document.getElementById('manual-save').addEventListener('click', async () => {
  const isTx = document.querySelector('.toggle-btn.active').dataset.type === 'transaction';
  const visibility = document.getElementById('manual-visibility').value;
  if (isTx) {
    const date = document.getElementById('manual-date').value;
    const description = document.getElementById('manual-desc').value.trim();
    const amount = parseFloat(document.getElementById('manual-amount').value);
    if (!date || !description || isNaN(amount)) { alert('Date, description, and amount are required.'); return; }
    const created = await api('POST', '/finance/transactions', {
      date, description, amount, visibility,
      type: document.getElementById('manual-type').value,
      category: document.getElementById('manual-category').value.trim(),
    });
    allTransactions.unshift(created);
    renderTransactions();
    refreshSummary();
  } else {
    const name = document.getElementById('manual-acct-name').value.trim();
    const balance = parseFloat(document.getElementById('manual-acct-balance').value);
    if (!name || isNaN(balance)) { alert('Account name and balance are required.'); return; }
    const created = await api('POST', '/finance/accounts', {
      name, balance, visibility,
      institution: document.getElementById('manual-acct-inst').value.trim(),
      type: document.getElementById('manual-acct-type').value,
    });
    allAccounts.push(created);
    renderAccounts();
    refreshSummary();
  }
  closeModal('manual-modal');
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────

let allUsers = [];
let editingUserId = null;

async function loadUsers() {
  const data = await api('GET', '/admin/users');
  allUsers = Array.isArray(data) ? data : [];
  renderUsers();
}

function renderUsers() {
  const el = document.getElementById('users-list');
  if (!allUsers.length) { el.innerHTML = '<p class="empty-msg">No users found.</p>'; return; }
  el.innerHTML = allUsers.map(u => `
    <div class="user-row">
      <div class="user-info">
        <strong>${u.name}</strong>
        <span class="user-meta">${u.id.replace('user:', '@')} · ${u.role}</span>
      </div>
      <div class="user-actions">
        <button class="btn-secondary btn-sm edit-user"
          data-id="${u.id}" data-name="${u.name}" data-role="${u.role}">Edit</button>
        ${u.id !== user.id
          ? `<button class="btn-icon delete-user" data-id="${u.id}" title="Delete">×</button>`
          : '<span class="user-meta">(you)</span>'}
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.edit-user').forEach(btn => {
    btn.addEventListener('click', () => {
      editingUserId = btn.dataset.id;
      document.getElementById('user-modal-title').textContent = 'Edit User';
      document.getElementById('user-username-field').classList.add('hidden');
      document.getElementById('user-name').value = btn.dataset.name;
      document.getElementById('user-role').value = btn.dataset.role;
      document.getElementById('user-password').value = '';
      document.getElementById('user-password-hint').classList.remove('hidden');
      openModal('user-modal');
    });
  });

  el.querySelectorAll('.delete-user').forEach(btn => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.id.replace('user:', '');
      if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
      await api('DELETE', `/admin/users/${username}`);
      await loadUsers();
    });
  });
}

document.getElementById('add-user-btn').addEventListener('click', () => {
  editingUserId = null;
  document.getElementById('user-modal-title').textContent = 'Add User';
  document.getElementById('user-username-field').classList.remove('hidden');
  document.getElementById('user-username').value = '';
  document.getElementById('user-name').value = '';
  document.getElementById('user-role').value = 'parent';
  document.getElementById('user-password').value = '';
  document.getElementById('user-password-hint').classList.add('hidden');
  openModal('user-modal');
});

document.getElementById('user-cancel').addEventListener('click', () => closeModal('user-modal'));

document.getElementById('user-save').addEventListener('click', async () => {
  const name = document.getElementById('user-name').value.trim();
  const role = document.getElementById('user-role').value;
  const password = document.getElementById('user-password').value;

  if (!name) { alert('Display name is required.'); return; }

  if (editingUserId) {
    const username = editingUserId.replace('user:', '');
    const body = { name, role };
    if (password) {
      if (password.length < 8) { alert('Password must be at least 8 characters.'); return; }
      body.password = password;
    }
    const result = await api('PUT', `/admin/users/${username}`, body);
    if (result?.error) { alert(result.error); return; }
  } else {
    const username = document.getElementById('user-username').value.trim();
    if (!username) { alert('Username is required.'); return; }
    if (!password || password.length < 8) { alert('Password must be at least 8 characters.'); return; }
    const result = await api('POST', '/admin/users', { username, name, role, password });
    if (result?.error) { alert(result.error); return; }
  }

  await loadUsers();
  closeModal('user-modal');
});

// ── Init ──────────────────────────────────────────────────────────────────────

initViewSelect();
loadEvents();
