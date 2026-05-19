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

let viewMode = 'family';
let userList = [];

async function initViewSelect() {
  const data = await api('GET', '/users');
  userList = Array.isArray(data) ? data : [];
  const select = document.getElementById('view-select');
  userList.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    select.appendChild(opt);
  });
}

document.getElementById('view-select').addEventListener('change', e => {
  viewMode = e.target.value;
  const active = document.querySelector('.section.active')?.id;
  if (active === 'dashboard') renderDashboard(lastSummary);
  if (active === 'schedule') { renderCalendar(); renderToday(); }
  if (active === 'finance') { renderAccounts(); renderTransactions(); renderGoals(); renderBudgetCategories(); }
  if (active === 'tasks') renderTasks();
  if (active === 'projects') renderProjects();
});

// ── View filters ──────────────────────────────────────────────────────────────

function visibleEvents()          { return viewMode === 'family' ? allEvents.filter(e => e.visibility === 'shared')           : allEvents.filter(e => e.owner === viewMode); }
function visibleAccounts()        { return viewMode === 'family' ? allAccounts.filter(a => a.visibility === 'shared')         : allAccounts.filter(a => a.owner === viewMode); }
function visibleTransactions()    { return viewMode === 'family' ? allTransactions.filter(t => t.visibility === 'shared')     : allTransactions.filter(t => t.owner === viewMode); }
function visibleGoals()           { return viewMode === 'family' ? allGoals.filter(g => g.visibility === 'shared')            : allGoals.filter(g => g.owner === viewMode); }
function visibleTasks()           { return viewMode === 'family' ? allTasks.filter(t => t.visibility === 'shared')            : allTasks.filter(t => t.owner === viewMode); }
function visibleProjects()        { return viewMode === 'family' ? allProjects.filter(p => p.visibility === 'shared')         : allProjects.filter(p => p.owner === viewMode); }
function visibleBudgetCategories(){ return viewMode === 'family' ? allBudgetCategories.filter(c => c.visibility === 'shared') : allBudgetCategories.filter(c => c.owner === viewMode); }
function visibleNotes()           { return viewMode === 'family' ? allNotes.filter(n => n.visibility === 'shared')            : allNotes.filter(n => n.owner === viewMode); }

// ── Data stores ───────────────────────────────────────────────────────────────

let allEvents = [], eventsLoaded = false;
let allTasks = [], tasksLoaded = false;
let allProjects = [], projectsLoaded = false;
let allAccounts = [], allTransactions = [], allGoals = [], allBudgetCategories = [], financeLoaded = false;
let allNotes = [], notesLoaded = false;
let allUsers = [];
let lastSummary = null;

async function ensureEvents() {
  if (eventsLoaded) return;
  eventsLoaded = true;
  const data = await api('GET', '/schedule/events');
  allEvents = Array.isArray(data) ? data : [];
}

async function ensureTasks() {
  if (tasksLoaded) return;
  tasksLoaded = true;
  const data = await api('GET', '/tasks');
  allTasks = Array.isArray(data) ? data : [];
}

async function ensureProjects() {
  if (projectsLoaded) return;
  projectsLoaded = true;
  const data = await api('GET', '/projects');
  allProjects = Array.isArray(data) ? data : [];
}

async function ensureFinance() {
  if (financeLoaded) return;
  financeLoaded = true;
  const [accounts, transactions, goals, budgetCats] = await Promise.all([
    api('GET', '/finance/accounts'),
    api('GET', '/finance/transactions'),
    api('GET', '/finance/goals'),
    api('GET', '/finance/budget-categories'),
  ]);
  allAccounts = Array.isArray(accounts) ? accounts : [];
  allTransactions = Array.isArray(transactions) ? transactions : [];
  allGoals = Array.isArray(goals) ? goals : [];
  allBudgetCategories = Array.isArray(budgetCats) ? budgetCats : [];
}

async function ensureNotes() {
  if (notesLoaded) return;
  notesLoaded = true;
  const data = await api('GET', '/notes');
  allNotes = Array.isArray(data) ? data : [];
}

// ── Navigation ────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.section).classList.add('active');
    if (btn.dataset.section === 'dashboard') loadDashboard();
    if (btn.dataset.section === 'schedule')  loadSchedule();
    if (btn.dataset.section === 'finance')   loadFinance();
    if (btn.dataset.section === 'tasks')     loadTasks();
    if (btn.dataset.section === 'projects')  loadProjects();
    if (btn.dataset.section === 'admin')     loadUsers();
  });
});

// ── Modal helpers ─────────────────────────────────────────────────────────────

const overlay = document.getElementById('modal-overlay');
const ALL_MODALS = ['event-modal','goal-modal','manual-modal','task-modal','project-modal','budget-cat-modal','user-modal','csv-modal'];

function openModal(id)  { overlay.classList.remove('hidden'); document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { overlay.classList.add('hidden');    document.getElementById(id).classList.add('hidden'); }

overlay.addEventListener('click', e => { if (e.target === overlay) ALL_MODALS.forEach(closeModal); });

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function privateBadge(r) {
  return r.visibility === 'private' ? '<span class="badge private-badge">private</span>' : '';
}

function toDateStr(d) { return d.toISOString().slice(0, 10); }

const TODAY = toDateStr(new Date());

function dueBadge(dueDate, status) {
  if (!dueDate) return '';
  const overdue = status === 'open' && dueDate < TODAY;
  return `<span class="task-due ${overdue ? 'overdue' : ''}">${dueDate}</span>`;
}

function refreshDashboardIfActive() {
  if (document.getElementById('dashboard').classList.contains('active')) {
    renderDashboardTasksWidget();
    document.getElementById('dash-open-tasks').textContent =
      allTasks.filter(t => t.status === 'open').length;
  }
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

async function loadDashboard() {
  const [summary] = await Promise.all([
    api('GET', '/finance/summary'),
    ensureEvents(),
    ensureTasks(),
    ensureNotes(),
  ]);
  lastSummary = summary;
  renderDashboard(summary);
}

function renderDashboard(summary) {
  // Stats row
  if (summary) {
    document.getElementById('dash-net-worth').textContent = fmt(summary.netWorth);
    document.getElementById('dash-spending').textContent  = fmt(summary.monthlySpending);
  }
  document.getElementById('dash-open-tasks').textContent =
    allTasks.filter(t => t.status === 'open').length;

  renderDashboardEventsWidget();
  renderDashboardTasksWidget();
  renderDashboardNotesWidget();
}

function renderDashboardEventsWidget() {
  const el = document.getElementById('dash-events');
  const todayEvents = visibleEvents()
    .filter(e => e.date === TODAY)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  if (!todayEvents.length) {
    el.innerHTML = '<p class="empty-msg">Nothing scheduled today.</p>';
    return;
  }
  el.innerHTML = todayEvents.map(e => `
    <div class="today-event">
      <span class="event-dot"></span>
      <div>
        <strong>${e.title}</strong>
        ${e.allDay ? '<span class="badge">all day</span>' : (e.time ? `<span class="event-time">${e.time}${e.endTime ? ' – ' + e.endTime : ''}</span>` : '')}
        ${e.description ? `<div class="event-desc">${e.description}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function renderDashboardTasksWidget() {
  const el = document.getElementById('dash-tasks');
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in7Str = toDateStr(in7);

  const upcoming = visibleTasks()
    .filter(t => t.status === 'open' && t.dueDate && t.dueDate <= in7Str)
    .slice(0, 6);

  const overdue = visibleTasks()
    .filter(t => t.status === 'open' && t.dueDate && t.dueDate < TODAY);

  if (!upcoming.length && !overdue.length) {
    el.innerHTML = '<p class="empty-msg">No tasks due in the next 7 days.</p>';
    return;
  }

  const rows = [...new Map([...overdue, ...upcoming].map(t => [t.id, t])).values()];
  el.innerHTML = rows.map(t => `
    <div class="dash-task-row">
      <span class="task-priority-dot priority-${t.priority}"></span>
      <span class="dash-task-title">${t.title}</span>
      ${dueBadge(t.dueDate, t.status)}
    </div>
  `).join('');
}

function renderDashboardNotesWidget() {
  const el = document.getElementById('dash-notes');
  const notes = visibleNotes();
  if (!notes.length) {
    el.innerHTML = '<p class="empty-msg">No notes yet.</p>';
    return;
  }
  el.innerHTML = notes.map(n => `
    <div class="note-item">
      <span class="note-text">${n.text}</span>
      <span class="note-author">${userList.find(u => u.id === n.owner)?.name ?? ''}</span>
      <button class="btn-icon delete-note" data-id="${n.id}" title="Dismiss">×</button>
    </div>
  `).join('');
  el.querySelectorAll('.delete-note').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('DELETE', `/notes/${btn.dataset.id}`);
      allNotes = allNotes.filter(n => n.id !== btn.dataset.id);
      renderDashboardNotesWidget();
    });
  });
}

document.getElementById('note-add-btn').addEventListener('click', async () => {
  const input = document.getElementById('note-input');
  const text = input.value.trim();
  if (!text) return;
  const created = await api('POST', '/notes', { text, visibility: 'shared' });
  allNotes.unshift(created);
  input.value = '';
  renderDashboardNotesWidget();
});

document.getElementById('note-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('note-add-btn').click();
});

// ── SCHEDULE ──────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let weekOffset = 0;

async function loadSchedule() {
  await ensureEvents();
  renderCalendar();
  renderToday();
  loadGoogleCalStatus(); // fire-and-forget banner load
}

function weekStart(offset) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function renderCalendar() {
  const grid  = document.getElementById('calendar-grid');
  const start = weekStart(weekOffset);
  const end   = new Date(start); end.setDate(end.getDate() + 6);
  document.getElementById('week-label').textContent =
    `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const days   = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const events = visibleEvents();

  grid.innerHTML = days.map(day => {
    const dateStr   = toDateStr(day);
    const dayEvents = events.filter(e => e.date === dateStr);
    return `
      <div class="cal-day ${dateStr === TODAY ? 'today' : ''}">
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
      renderCalendar(); renderToday();
    });
  });
}

function renderToday() {
  const todayEvents = visibleEvents()
    .filter(e => e.date === TODAY)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const el = document.getElementById('today-events');
  if (!todayEvents.length) { el.innerHTML = '<p class="empty-msg">Nothing scheduled today.</p>'; return; }
  el.innerHTML = todayEvents.map(e => `
    <div class="today-event">
      <span class="event-dot"></span>
      <div>
        <strong>${e.title}</strong> ${privateBadge(e)}
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
  document.getElementById('event-date').value = TODAY;
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
  const date  = document.getElementById('event-date').value;
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
    allEvents.push(await api('POST', '/schedule/events', body));
  }
  closeModal('event-modal'); renderCalendar(); renderToday();
});

// ── FINANCE ───────────────────────────────────────────────────────────────────

async function loadFinance() {
  await ensureFinance();
  const summary = await api('GET', '/finance/summary');
  lastSummary = summary;
  renderSummary(summary);
  renderAccounts();
  renderTransactions();
  renderGoals();
  renderBudgetCategories();
}

function renderSummary(s) {
  if (!s) return;
  document.getElementById('net-worth').textContent      = fmt(s.netWorth);
  document.getElementById('total-assets').textContent   = fmt(s.totalAssets);
  document.getElementById('total-debt').textContent     = fmt(s.totalDebt);
  document.getElementById('monthly-spending').textContent = fmt(s.monthlySpending);
  document.getElementById('tax-income').textContent     = fmt(s.quarterlyIncome);
  document.getElementById('tax-owed').textContent       = fmt(s.estimatedTax);
}

async function refreshSummary() {
  const s = await api('GET', '/finance/summary');
  lastSummary = s;
  renderSummary(s);
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
      renderAccounts(); refreshSummary();
    });
  });
}

function renderTransactions() {
  const search = document.getElementById('tx-search').value.toLowerCase();
  const cat    = document.getElementById('tx-category-filter').value;
  const base   = visibleTransactions();
  const filtered = base.filter(t =>
    (!search || t.description.toLowerCase().includes(search)) &&
    (!cat || t.category === cat)
  );
  const cats = [...new Set(base.map(t => t.category).filter(Boolean))].sort();
  const catFilter = document.getElementById('tx-category-filter');
  const cur = catFilter.value;
  catFilter.innerHTML = '<option value="">All categories</option>' +
    cats.map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>${c}</option>`).join('');
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
      renderTransactions(); refreshSummary();
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
        <div class="goal-amounts"><span>${fmt(g.current)}</span><span>of ${fmt(g.target)}</span></div>
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

function renderBudgetCategories() {
  const el = document.getElementById('budget-categories-list');
  const cats = visibleBudgetCategories();
  if (!cats.length) { el.innerHTML = '<p class="empty-msg">No categories yet. Add a category to track spending against a monthly target.</p>'; return; }

  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

  el.innerHTML = cats.map(c => {
    const actual = allTransactions
      .filter(t => t.type === 'debit' && t.date >= monthStart && t.category?.toLowerCase() === c.name.toLowerCase())
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const pct  = c.monthlyTarget > 0 ? Math.min(110, (actual / c.monthlyTarget) * 100) : 0;
    const over = actual > c.monthlyTarget;
    return `
      <div class="budget-cat-row">
        <div class="budget-cat-info"><strong>${c.name}</strong></div>
        <div class="budget-cat-bar-wrap">
          <div class="goal-bar">
            <div class="goal-fill ${over ? 'over-budget' : ''}" style="width:${Math.min(100,pct)}%"></div>
          </div>
          <div class="budget-cat-amounts">
            <span class="${over ? 'text-danger' : ''}">${fmt(actual)}</span>
            <span class="text-muted"> / ${fmt(c.monthlyTarget)}</span>
          </div>
        </div>
        <div class="budget-cat-actions">
          <button class="btn-icon edit-bc" data-id="${c.id}" title="Edit">✎</button>
          <button class="btn-icon delete-bc" data-id="${c.id}" title="Delete">×</button>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('.edit-bc').forEach(btn => {
    btn.addEventListener('click', () => openBudgetCatModal(btn.dataset.id));
  });
  el.querySelectorAll('.delete-bc').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this category?')) return;
      await api('DELETE', `/finance/budget-categories/${btn.dataset.id}`);
      allBudgetCategories = allBudgetCategories.filter(c => c.id !== btn.dataset.id);
      renderBudgetCategories();
    });
  });
}

// Goal modal
document.getElementById('add-goal-btn').addEventListener('click', () => {
  ['goal-name','goal-category'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('goal-target').value = '';
  document.getElementById('goal-current').value = '0';
  document.getElementById('goal-date').value = '';
  document.getElementById('goal-visibility').value = 'shared';
  openModal('goal-modal');
});
document.getElementById('goal-cancel').addEventListener('click', () => closeModal('goal-modal'));
document.getElementById('goal-save').addEventListener('click', async () => {
  const name   = document.getElementById('goal-name').value.trim();
  const target = parseFloat(document.getElementById('goal-target').value);
  if (!name || isNaN(target)) { alert('Name and target amount are required.'); return; }
  const created = await api('POST', '/finance/goals', {
    name, target,
    current:    parseFloat(document.getElementById('goal-current').value) || 0,
    category:   document.getElementById('goal-category').value.trim(),
    targetDate: document.getElementById('goal-date').value || null,
    visibility: document.getElementById('goal-visibility').value,
  });
  allGoals.push(created);
  closeModal('goal-modal'); renderGoals();
});

// Manual entry modal
document.getElementById('manual-entry-btn').addEventListener('click', () => {
  document.getElementById('manual-date').value = TODAY;
  ['manual-desc','manual-category','manual-acct-name','manual-acct-inst'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('manual-amount').value = '';
  document.getElementById('manual-acct-balance').value = '';
  document.getElementById('manual-visibility').value = 'shared';
  document.querySelectorAll('#manual-modal .toggle-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#manual-modal .toggle-btn[data-type="transaction"]').classList.add('active');
  document.getElementById('manual-tx-fields').classList.remove('hidden');
  document.getElementById('manual-acct-fields').classList.add('hidden');
  openModal('manual-modal');
});
document.querySelectorAll('#manual-modal .toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#manual-modal .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isTx = btn.dataset.type === 'transaction';
    document.getElementById('manual-tx-fields').classList.toggle('hidden', !isTx);
    document.getElementById('manual-acct-fields').classList.toggle('hidden', isTx);
  });
});
document.getElementById('manual-cancel').addEventListener('click', () => closeModal('manual-modal'));
document.getElementById('manual-save').addEventListener('click', async () => {
  const isTx = document.querySelector('#manual-modal .toggle-btn.active').dataset.type === 'transaction';
  const visibility = document.getElementById('manual-visibility').value;
  if (isTx) {
    const date        = document.getElementById('manual-date').value;
    const description = document.getElementById('manual-desc').value.trim();
    const amount      = parseFloat(document.getElementById('manual-amount').value);
    if (!date || !description || isNaN(amount)) { alert('Date, description, and amount are required.'); return; }
    allTransactions.unshift(await api('POST', '/finance/transactions', {
      date, description, amount, visibility,
      type:     document.getElementById('manual-type').value,
      category: document.getElementById('manual-category').value.trim(),
    }));
    renderTransactions(); refreshSummary();
  } else {
    const name    = document.getElementById('manual-acct-name').value.trim();
    const balance = parseFloat(document.getElementById('manual-acct-balance').value);
    if (!name || isNaN(balance)) { alert('Account name and balance are required.'); return; }
    allAccounts.push(await api('POST', '/finance/accounts', {
      name, balance, visibility,
      institution: document.getElementById('manual-acct-inst').value.trim(),
      type:        document.getElementById('manual-acct-type').value,
    }));
    renderAccounts(); refreshSummary();
  }
  closeModal('manual-modal');
});

// Budget category modal
let editingBcId = null;

function openBudgetCatModal(bcId = null) {
  editingBcId = bcId;
  document.getElementById('budget-cat-modal-title').textContent = bcId ? 'Edit Category' : 'Add Category';
  if (bcId) {
    const c = allBudgetCategories.find(c => c.id === bcId);
    if (!c) return;
    document.getElementById('bc-name').value   = c.name;
    document.getElementById('bc-target').value = c.monthlyTarget;
  } else {
    document.getElementById('bc-name').value   = '';
    document.getElementById('bc-target').value = '';
  }
  openModal('budget-cat-modal');
}

document.getElementById('add-budget-cat-btn').addEventListener('click', () => openBudgetCatModal());
document.getElementById('bc-cancel').addEventListener('click', () => closeModal('budget-cat-modal'));
document.getElementById('bc-save').addEventListener('click', async () => {
  const name   = document.getElementById('bc-name').value.trim();
  const target = parseFloat(document.getElementById('bc-target').value);
  if (!name || isNaN(target)) { alert('Category name and monthly target are required.'); return; }
  if (editingBcId) {
    const updated = await api('PUT', `/finance/budget-categories/${editingBcId}`, { name, monthlyTarget: target });
    allBudgetCategories = allBudgetCategories.map(c => c.id === editingBcId ? updated : c);
  } else {
    allBudgetCategories.push(await api('POST', '/finance/budget-categories', { name, monthlyTarget: target }));
  }
  closeModal('budget-cat-modal'); renderBudgetCategories();
});

// ── TASKS ─────────────────────────────────────────────────────────────────────

async function loadTasks() {
  await Promise.all([ensureTasks(), ensureProjects()]);
  // Populate filter selects
  const af = document.getElementById('task-assignee-filter');
  af.innerHTML = '<option value="">All assignees</option>' +
    userList.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
  const pf = document.getElementById('task-project-filter');
  pf.innerHTML = '<option value="">All projects</option>' +
    allProjects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  renderTasks();
}

['task-status-filter','task-assignee-filter','task-project-filter'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderTasks);
});

function renderTasks() {
  const sf = document.getElementById('task-status-filter').value;
  const af = document.getElementById('task-assignee-filter').value;
  const pf = document.getElementById('task-project-filter').value;

  let tasks = visibleTasks();
  if (sf) tasks = tasks.filter(t => t.status === sf);
  if (af) tasks = tasks.filter(t => t.assignee === af);
  if (pf) tasks = tasks.filter(t => t.projectId === pf);

  tasks.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1; if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const el = document.getElementById('tasks-list');
  if (!tasks.length) { el.innerHTML = '<p class="empty-msg">No tasks.</p>'; return; }

  el.innerHTML = tasks.map(t => {
    const project      = allProjects.find(p => p.id === t.projectId);
    const assigneeUser = userList.find(u => u.id === t.assignee);
    return `
      <div class="task-row ${t.status === 'done' ? 'task-done-row' : ''}">
        <input type="checkbox" class="task-check" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} />
        <span class="task-priority-dot priority-${t.priority}"></span>
        <div class="task-info">
          <span class="task-title ${t.status === 'done' ? 'task-done' : ''}">${t.title}</span>
          ${project ? `<span class="task-project-tag">${project.name}</span>` : ''}
        </div>
        <div class="task-meta">
          ${dueBadge(t.dueDate, t.status)}
          ${assigneeUser ? `<span class="badge">${assigneeUser.name}</span>` : ''}
          ${privateBadge(t)}
        </div>
        <button class="btn-secondary btn-sm edit-task" data-id="${t.id}">Edit</button>
        <button class="btn-icon delete-task" data-id="${t.id}" title="Delete">×</button>
      </div>`;
  }).join('');

  el.querySelectorAll('.task-check').forEach(cb => {
    cb.addEventListener('change', async () => {
      const updated = await api('PUT', `/tasks/${cb.dataset.id}`, { status: cb.checked ? 'done' : 'open' });
      allTasks = allTasks.map(t => t.id === cb.dataset.id ? updated : t);
      renderTasks(); refreshDashboardIfActive();
    });
  });
  el.querySelectorAll('.edit-task').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(btn.dataset.id));
  });
  el.querySelectorAll('.delete-task').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this task?')) return;
      await api('DELETE', `/tasks/${btn.dataset.id}`);
      allTasks = allTasks.filter(t => t.id !== btn.dataset.id);
      renderTasks(); refreshDashboardIfActive();
    });
  });
}

let editingTaskId = null;

function openTaskModal(taskId = null) {
  editingTaskId = taskId;
  document.getElementById('task-modal-title').textContent = taskId ? 'Edit Task' : 'Add Task';

  // Populate assignee + project selects
  document.getElementById('task-assignee').innerHTML =
    '<option value="">Unassigned</option>' +
    userList.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
  document.getElementById('task-project').innerHTML =
    '<option value="">No project</option>' +
    allProjects.filter(p => p.status !== 'complete').map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  const task = taskId ? allTasks.find(t => t.id === taskId) : null;
  document.getElementById('task-title').value        = task?.title      ?? '';
  document.getElementById('task-due').value          = task?.dueDate    ?? '';
  document.getElementById('task-assignee').value     = task?.assignee   ?? '';
  document.getElementById('task-project').value      = task?.projectId  ?? '';
  document.getElementById('task-notes').value        = task?.notes      ?? '';
  document.getElementById('task-visibility').value   = task?.visibility ?? 'shared';

  const priority = task?.priority ?? 'normal';
  document.querySelectorAll('#task-modal .toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.priority === priority));

  openModal('task-modal');
}

document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal());
document.getElementById('task-cancel').addEventListener('click', () => closeModal('task-modal'));

document.querySelectorAll('#task-modal .toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#task-modal .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.getElementById('task-save').addEventListener('click', async () => {
  const title = document.getElementById('task-title').value.trim();
  if (!title) { alert('Title is required.'); return; }
  const priority = document.querySelector('#task-modal .toggle-btn.active')?.dataset.priority ?? 'normal';
  const body = {
    title,
    dueDate:    document.getElementById('task-due').value || null,
    assignee:   document.getElementById('task-assignee').value || null,
    priority,
    projectId:  document.getElementById('task-project').value || null,
    notes:      document.getElementById('task-notes').value.trim(),
    visibility: document.getElementById('task-visibility').value,
  };
  if (editingTaskId) {
    const updated = await api('PUT', `/tasks/${editingTaskId}`, body);
    allTasks = allTasks.map(t => t.id === editingTaskId ? updated : t);
  } else {
    allTasks.push(await api('POST', '/tasks', body));
  }
  closeModal('task-modal'); renderTasks(); refreshDashboardIfActive();
});

// ── PROJECTS ──────────────────────────────────────────────────────────────────

async function loadProjects() {
  await Promise.all([ensureProjects(), ensureTasks()]);
  renderProjects();
}

function renderProjects() {
  const el = document.getElementById('projects-grid');
  const projects = visibleProjects();
  if (!projects.length) {
    el.innerHTML = '<p class="empty-msg" style="padding:16px 0">No projects yet.</p>';
    return;
  }
  el.innerHTML = projects.map(p => {
    const open  = allTasks.filter(t => t.projectId === p.id && t.status === 'open').length;
    const total = allTasks.filter(t => t.projectId === p.id).length;
    return `
      <div class="project-card">
        <div class="project-header">
          <h3>${p.name} ${privateBadge(p)}</h3>
          <span class="status-badge status-${p.status}">${p.status}</span>
        </div>
        ${p.description ? `<p class="project-desc">${p.description}</p>` : ''}
        <div class="project-meta">
          <span>${open} open / ${total} task${total !== 1 ? 's' : ''}</span>
          ${p.budget ? `<span>${fmt(p.budget)} budget</span>` : ''}
        </div>
        <div class="project-actions">
          <button class="btn-secondary btn-sm edit-project" data-id="${p.id}">Edit</button>
          <button class="btn-icon delete-project" data-id="${p.id}" title="Delete">×</button>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('.edit-project').forEach(btn => {
    btn.addEventListener('click', () => openProjectModal(btn.dataset.id));
  });
  el.querySelectorAll('.delete-project').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this project?')) return;
      await api('DELETE', `/projects/${btn.dataset.id}`);
      allProjects = allProjects.filter(p => p.id !== btn.dataset.id);
      renderProjects();
    });
  });
}

let editingProjectId = null;

function openProjectModal(projectId = null) {
  editingProjectId = projectId;
  document.getElementById('project-modal-title').textContent = projectId ? 'Edit Project' : 'Add Project';
  const p = projectId ? allProjects.find(p => p.id === projectId) : null;
  document.getElementById('project-name').value        = p?.name        ?? '';
  document.getElementById('project-desc').value        = p?.description ?? '';
  document.getElementById('project-status').value      = p?.status      ?? 'active';
  document.getElementById('project-budget').value      = p?.budget      ?? '';
  document.getElementById('project-visibility').value  = p?.visibility  ?? 'shared';
  openModal('project-modal');
}

document.getElementById('add-project-btn').addEventListener('click', () => openProjectModal());
document.getElementById('project-cancel').addEventListener('click', () => closeModal('project-modal'));
document.getElementById('project-save').addEventListener('click', async () => {
  const name = document.getElementById('project-name').value.trim();
  if (!name) { alert('Project name is required.'); return; }
  const body = {
    name,
    description: document.getElementById('project-desc').value.trim(),
    status:      document.getElementById('project-status').value,
    budget:      document.getElementById('project-budget').value || null,
    visibility:  document.getElementById('project-visibility').value,
  };
  if (editingProjectId) {
    const updated = await api('PUT', `/projects/${editingProjectId}`, body);
    allProjects = allProjects.map(p => p.id === editingProjectId ? updated : p);
  } else {
    allProjects.push(await api('POST', '/projects', body));
  }
  closeModal('project-modal'); renderProjects();
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────

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
      document.getElementById('user-name').value   = btn.dataset.name;
      document.getElementById('user-role').value   = btn.dataset.role;
      document.getElementById('user-password').value = '';
      document.getElementById('user-password-hint').classList.remove('hidden');
      openModal('user-modal');
    });
  });
  el.querySelectorAll('.delete-user').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete user "${btn.dataset.id.replace('user:', '')}"? This cannot be undone.`)) return;
      await api('DELETE', `/admin/users/${btn.dataset.id.replace('user:', '')}`);
      await loadUsers();
    });
  });
}

let editingUserId = null;

document.getElementById('add-user-btn').addEventListener('click', () => {
  editingUserId = null;
  document.getElementById('user-modal-title').textContent = 'Add User';
  document.getElementById('user-username-field').classList.remove('hidden');
  ['user-username','user-name','user-password'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('user-role').value = 'parent';
  document.getElementById('user-password-hint').classList.add('hidden');
  openModal('user-modal');
});
document.getElementById('user-cancel').addEventListener('click', () => closeModal('user-modal'));
document.getElementById('user-save').addEventListener('click', async () => {
  const name     = document.getElementById('user-name').value.trim();
  const role     = document.getElementById('user-role').value;
  const password = document.getElementById('user-password').value;
  if (!name) { alert('Display name is required.'); return; }
  if (editingUserId) {
    const body = { name, role };
    if (password) {
      if (password.length < 8) { alert('Password must be at least 8 characters.'); return; }
      body.password = password;
    }
    const result = await api('PUT', `/admin/users/${editingUserId.replace('user:', '')}`, body);
    if (result?.error) { alert(result.error); return; }
  } else {
    const username = document.getElementById('user-username').value.trim();
    if (!username) { alert('Username is required.'); return; }
    if (!password || password.length < 8) { alert('Password must be at least 8 characters.'); return; }
    const result = await api('POST', '/admin/users', { username, name, role, password });
    if (result?.error) { alert(result.error); return; }
  }
  await loadUsers(); closeModal('user-modal');
});

// ── GOOGLE CALENDAR INTEGRATION ───────────────────────────────────────────────

async function loadGoogleCalStatus() {
  const el = document.getElementById('gcal-banner');
  try {
    const status = await api('GET', '/integrations/google/status');
    renderGcalBanner(el, status);
  } catch {
    el.classList.add('hidden');
  }
}

function renderGcalBanner(el, status) {
  el.classList.remove('hidden');
  if (!status.connected) {
    el.innerHTML = `
      <div class="integration-status disconnected">
        <span>📅 Connect Google Calendar to sync events automatically.</span>
        <button class="btn-primary btn-sm" id="gcal-connect-btn">Connect Google Calendar</button>
      </div>`;
    el.querySelector('#gcal-connect-btn').addEventListener('click', connectGoogleCal);
    return;
  }
  const lastSync = status.lastSync
    ? new Date(status.lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never';
  el.innerHTML = `
    <div class="integration-status connected">
      <span>✅ Google Calendar connected · Last sync: ${lastSync}</span>
      <div style="display:flex;gap:8px">
        <button class="btn-primary btn-sm" id="gcal-sync-btn">Sync Now</button>
        <button class="btn-secondary btn-sm" id="gcal-disconnect-btn">Disconnect</button>
      </div>
    </div>`;
  el.querySelector('#gcal-sync-btn').addEventListener('click', () => syncGoogleCal(el));
  el.querySelector('#gcal-disconnect-btn').addEventListener('click', () => disconnectGoogleCal(el));
}

async function connectGoogleCal() {
  const data = await api('GET', '/integrations/google/auth');
  if (data?.error) { alert(data.error); return; }
  if (data?.authUrl) window.location.href = data.authUrl;
}

async function syncGoogleCal(bannerEl) {
  const btn = bannerEl.querySelector('#gcal-sync-btn');
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  const result = await api('POST', '/integrations/google/sync');
  if (result?.error) {
    alert(result.error);
    btn.disabled = false;
    btn.textContent = 'Sync Now';
    return;
  }
  // Reload events from server so the calendar reflects synced data
  eventsLoaded = false;
  await ensureEvents();
  renderCalendar();
  renderToday();
  // Refresh the banner to show updated lastSync time
  const status = await api('GET', '/integrations/google/status');
  renderGcalBanner(bannerEl, status);
  showToast(`Synced ${result.synced} event${result.synced !== 1 ? 's' : ''} from Google Calendar.`);
}

async function disconnectGoogleCal(bannerEl) {
  if (!confirm('Disconnect Google Calendar? Synced events will remain but no new syncs will occur.')) return;
  await api('DELETE', '/integrations/google/disconnect');
  renderGcalBanner(bannerEl, { connected: false });
}

// ── CSV TRANSACTION IMPORT ────────────────────────────────────────────────────

let csvParsedRows = [];

document.getElementById('import-csv-btn').addEventListener('click', () => {
  csvParsedRows = [];
  document.getElementById('csv-file').value = '';
  document.getElementById('csv-preview').classList.add('hidden');
  document.getElementById('csv-import-btn').classList.add('hidden');
  // Populate account select
  const sel = document.getElementById('csv-account-select');
  sel.innerHTML = '<option value="">— No account —</option>' +
    allAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  openModal('csv-modal');
});

document.getElementById('csv-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => parseCsvFile(ev.target.result);
  reader.readAsText(file);
});

function parseCsvFile(text) {
  // Normalise line endings, split rows
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) { alert('CSV file appears empty or has no data rows.'); return; }

  const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());

  // Detect format by column headers
  let format = 'generic';
  if (headers.includes('transaction date') && headers.includes('post date')) format = 'chase';
  else if (headers.includes('posted date') && headers.includes('payee'))    format = 'bofa';
  else if (headers.includes('transaction type') && headers.includes('original description')) format = 'mint';

  const formatLabels = {
    chase:   'Chase format detected',
    bofa:    'Bank of America format detected',
    mint:    'Mint / Tiller format detected',
    generic: 'Generic CSV — mapped by column name',
  };

  // Column index finders
  const col = name => headers.indexOf(name);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    if (cells.every(c => !c.trim())) continue; // skip blank rows

    let date, description, amount, type, category;

    if (format === 'chase') {
      date        = cells[col('transaction date')]?.trim() ?? '';
      description = cells[col('description')]?.trim()      ?? '';
      const raw   = parseFloat(cells[col('amount')]?.trim() ?? '0');
      amount      = Math.abs(raw);
      type        = raw < 0 ? 'debit' : 'credit';
      category    = cells[col('category')]?.trim() ?? '';
    } else if (format === 'bofa') {
      date        = cells[col('posted date')]?.trim() ?? '';
      description = cells[col('payee')]?.trim()       ?? '';
      const raw   = parseFloat(cells[col('amount')]?.trim() ?? '0');
      amount      = Math.abs(raw);
      type        = raw < 0 ? 'debit' : 'credit';
      category    = '';
    } else if (format === 'mint') {
      date        = cells[col('date')]?.trim()              ?? '';
      description = cells[col('description')]?.trim()       ?? '';
      amount      = Math.abs(parseFloat(cells[col('amount')]?.trim() ?? '0'));
      const txType = cells[col('transaction type')]?.trim().toLowerCase() ?? '';
      type        = txType === 'credit' ? 'credit' : 'debit';
      category    = cells[col('category')]?.trim() ?? '';
    } else {
      // Generic: look for common column names
      const dateIdx = col('date') >= 0 ? col('date') : col('transaction date') >= 0 ? col('transaction date') : 0;
      const descIdx = col('description') >= 0 ? col('description') : col('memo') >= 0 ? col('memo') : 1;
      const amtIdx  = col('amount') >= 0 ? col('amount') : 2;
      date        = cells[dateIdx]?.trim() ?? '';
      description = cells[descIdx]?.trim() ?? '';
      const raw   = parseFloat(cells[amtIdx]?.trim() ?? '0');
      amount      = Math.abs(raw);
      type        = raw < 0 ? 'debit' : 'credit';
      category    = col('category') >= 0 ? (cells[col('category')]?.trim() ?? '') : '';
    }

    // Normalise date to YYYY-MM-DD
    const parsedDate = normaliseDate(date);
    if (!parsedDate || isNaN(amount)) continue;

    rows.push({ date: parsedDate, description, amount, type, category });
  }

  csvParsedRows = rows;

  // Render preview
  document.getElementById('csv-format-label').textContent = formatLabels[format];
  const preview = rows.slice(0, 5);
  document.getElementById('csv-table-wrap').innerHTML = `
    <table class="csv-preview-table">
      <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Type</th><th>Category</th></tr></thead>
      <tbody>${preview.map(r => `
        <tr>
          <td>${r.date}</td>
          <td>${r.description}</td>
          <td>${fmt(r.amount)}</td>
          <td>${r.type}</td>
          <td>${r.category}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  document.getElementById('csv-count-label').textContent =
    `${rows.length} transaction${rows.length !== 1 ? 's' : ''} ready to import${rows.length > 5 ? ' (showing first 5)' : ''}.`;
  document.getElementById('csv-preview').classList.remove('hidden');
  document.getElementById('csv-import-btn').classList.remove('hidden');
}

function parseCsvRow(line) {
  // Handle quoted fields with commas inside
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function normaliseDate(str) {
  if (!str) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // MM/DD/YYYY or M/D/YYYY
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

document.getElementById('csv-import-btn').addEventListener('click', async () => {
  if (!csvParsedRows.length) return;
  const visibility = document.getElementById('csv-visibility').value;
  const btn = document.getElementById('csv-import-btn');
  btn.disabled = true;
  btn.textContent = 'Importing…';

  let imported = 0;
  for (const row of csvParsedRows) {
    const created = await api('POST', '/finance/transactions', {
      date:        row.date,
      description: row.description,
      amount:      row.amount,
      type:        row.type,
      category:    row.category,
      visibility,
    });
    if (created && !created.error) {
      allTransactions.unshift(created);
      imported++;
    }
  }

  closeModal('csv-modal');
  renderTransactions();
  await refreshSummary();
  showToast(`Imported ${imported} transaction${imported !== 1 ? 's' : ''}.`);
});

document.getElementById('csv-cancel').addEventListener('click', () => closeModal('csv-modal'));

// ── Toast notification ────────────────────────────────────────────────────────

function showToast(message, duration = 3500) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('visible'), duration);
}

// ── Handle OAuth return params ────────────────────────────────────────────────

function handleOAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  const google = params.get('google');
  if (!google) return;
  // Clean the URL
  window.history.replaceState({}, '', window.location.pathname);
  if (google === 'connected') showToast('Google Calendar connected! Go to Schedule → Sync Now to import events.');
  if (google === 'error')     showToast(`Google Calendar connection failed: ${params.get('reason') ?? 'unknown error'}.`);
}

// ── Init ──────────────────────────────────────────────────────────────────────

handleOAuthReturn();
initViewSelect();
loadDashboard();
