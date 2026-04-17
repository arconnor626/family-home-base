const WORKER_URL = "https://family-home-base.arconnor626.workers.dev";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

let currentWeekOffset = 0;
let allEvents = [];

// --- Nav ---
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.section).classList.add("active");
  });
});

// --- Header date ---
function updateHeaderDate() {
  const now = new Date();
  document.getElementById("current-date").textContent =
    `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

// --- Week nav ---
document.getElementById("prev-week").addEventListener("click", () => { currentWeekOffset--; renderCalendar(); });
document.getElementById("next-week").addEventListener("click", () => { currentWeekOffset++; renderCalendar(); });

function getWeekStart(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day + offset * 7);
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return "All day";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function ownerClass(owner) {
  if (!owner) return "family";
  const o = owner.toLowerCase();
  if (o === "alex") return "alex";
  if (o === "wife" || o === "sarah" || o === "mom") return "wife";
  return "family";
}

// --- Render calendar grid ---
function renderCalendar() {
  const weekStart = getWeekStart(currentWeekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  document.getElementById("week-label").textContent =
    `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const today = new Date();
  today.setHours(0,0,0,0);

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const isToday = day.getTime() === today.getTime();

    const col = document.createElement("div");
    col.className = "day-col" + (isToday ? " today" : "");

    const numEl = document.createElement("div");
    numEl.className = "day-num";
    numEl.textContent = day.getDate();

    const header = document.createElement("div");
    header.className = "day-header";
    header.innerHTML = `<div class="day-name">${DAYS[day.getDay()]}</div>`;
    header.appendChild(numEl);
    col.appendChild(header);

    const dayEvents = allEvents.filter(e => {
      const eDate = new Date(e.start);
      eDate.setHours(0,0,0,0);
      return eDate.getTime() === day.getTime();
    }).sort((a,b) => new Date(a.start) - new Date(b.start));

    dayEvents.forEach(e => {
      const chip = document.createElement("div");
      chip.className = `event-chip ${ownerClass(e.owner)}`;
      chip.textContent = e.title;
      chip.title = `${e.title} — ${formatTime(e.start)}`;
      col.appendChild(chip);
    });

    grid.appendChild(col);
  }

  renderToday();
}

// --- Today's events panel ---
function renderToday() {
  const today = new Date();
  today.setHours(0,0,0,0);

  const todayEvents = allEvents.filter(e => {
    const eDate = new Date(e.start);
    eDate.setHours(0,0,0,0);
    return eDate.getTime() === today.getTime();
  }).sort((a,b) => new Date(a.start) - new Date(b.start));

  const container = document.getElementById("today-events");
  container.innerHTML = "";

  if (todayEvents.length === 0) {
    container.innerHTML = `<div class="empty-state">No events today</div>`;
    return;
  }

  todayEvents.forEach(e => {
    const row = document.createElement("div");
    row.className = "event-row";
    row.innerHTML = `
      <div class="event-time">${formatTime(e.start)}</div>
      <div class="event-dot ${ownerClass(e.owner)}"></div>
      <div>
        <div class="event-title">${e.title}</div>
        <div class="event-cal">${e.calendar || ""}</div>
      </div>
    `;
    container.appendChild(row);
  });
}

// --- Fetch events from worker ---
async function fetchEvents() {
  try {
    const weekStart = getWeekStart(-1);
    const weekEnd = getWeekStart(4);
    const res = await fetch(`${WORKER_URL}/events?start=${weekStart.toISOString()}&end=${weekEnd.toISOString()}`);
    if (!res.ok) throw new Error("Worker error");
    const data = await res.json();
    allEvents = data.events || [];
  } catch {
    // Worker not yet returning events — use demo data
    allEvents = getDemoEvents();
  }
  renderCalendar();
}

// --- Demo events (shown until Google Calendar is connected) ---
function getDemoEvents() {
  const today = new Date();
  const d = (offset, h = 9, m = 0) => {
    const dt = new Date(today);
    dt.setDate(today.getDate() + offset);
    dt.setHours(h, m, 0, 0);
    return dt.toISOString();
  };
  return [
    { title: "Team standup", start: d(0, 9), owner: "alex", calendar: "Alex — Work" },
    { title: "Dentist appt", start: d(0, 14), owner: "wife", calendar: "Sarah — Personal" },
    { title: "Family dinner", start: d(0, 18, 30), owner: "family", calendar: "Family" },
    { title: "School pickup", start: d(1, 15), owner: "wife", calendar: "Sarah — Personal" },
    { title: "Project review", start: d(2, 10), owner: "alex", calendar: "Alex — Work" },
    { title: "Grocery run", start: d(3, 11), owner: "family", calendar: "Family" },
    { title: "Soccer practice", start: d(4, 16), owner: "family", calendar: "Family" },
    { title: "Date night", start: d(5, 19), owner: "family", calendar: "Family" },
  ];
}

// --- Init ---
updateHeaderDate();
fetchEvents();

// ================================================================
// FINANCE
// ================================================================
const TELLER_APP_ID = "app_pr6smqec79tq045oi0000";

let allTransactions = [];
let allAccounts = [];

// --- Connect bank via Teller ---
document.getElementById("connect-bank-btn").addEventListener("click", () => {
  const teller = TellerConnect.setup({
    applicationId: TELLER_APP_ID,
    onSuccess: async (enrollment) => {
      await fetch(`${WORKER_URL}/finance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: enrollment.accessToken, enrollment }),
      });
      loadFinanceData();
    },
  });
  teller.open();
});

// --- Load all finance data ---
async function loadFinanceData() {
  await Promise.all([loadAccounts(), loadTransactions()]);
  await loadSummary();
  loadGoals();
}

// --- Accounts ---
async function loadAccounts() {
  try {
    const res = await fetch(`${WORKER_URL}/finance/accounts`);
    const data = await res.json();
    allAccounts = data.accounts || [];
    renderAccounts();
    renderNetWorth();
  } catch (e) {
    console.error("Accounts error:", e);
  }
}

function renderAccounts() {
  const el = document.getElementById("accounts-list");
  if (allAccounts.length === 0) {
    el.innerHTML = `<div class="empty-state">No accounts connected. Click "+ Connect Bank" to get started.</div>`;
    return;
  }
  el.innerHTML = allAccounts.map(a => `
    <div class="acct-row">
      <div>
        <div class="acct-name">${a.name}</div>
        <div class="acct-inst">${a.institution}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="acct-type">${a.subtype || a.type}</span>
        <span class="acct-balance ${a.type === 'credit' || a.type === 'loan' ? 'negative' : ''}">${formatMoney(a.balance)}</span>
      </div>
    </div>
  `).join("");
}

function renderNetWorth() {
  const assets = allAccounts
    .filter(a => a.type !== "credit" && a.type !== "loan")
    .reduce((s, a) => s + (a.balance || 0), 0);
  const debt = allAccounts
    .filter(a => a.type === "credit" || a.type === "loan")
    .reduce((s, a) => s + Math.abs(a.balance || 0), 0);
  const netWorth = assets - debt;

  const nwEl = document.getElementById("net-worth");
  nwEl.textContent = formatMoney(netWorth);
  nwEl.className = "card-value " + (netWorth >= 0 ? "positive" : "negative");
  document.getElementById("total-assets").textContent = formatMoney(assets);
  document.getElementById("total-debt").textContent = formatMoney(debt);
}

// --- Transactions ---
async function loadTransactions() {
  try {
    const res = await fetch(`${WORKER_URL}/finance/transactions`);
    const data = await res.json();
    allTransactions = data.transactions || [];
    renderTransactions();
    populateCategoryFilter();
  } catch (e) {
    console.error("Transactions error:", e);
  }
}

function renderTransactions(filter = "", categoryFilter = "") {
  const el = document.getElementById("transactions-list");
  let txs = allTransactions;

  if (filter) txs = txs.filter(t => t.description?.toLowerCase().includes(filter.toLowerCase()));
  if (categoryFilter) txs = txs.filter(t => t.category === categoryFilter);

  const shown = txs.slice(0, 50);
  if (shown.length === 0) {
    el.innerHTML = `<div class="empty-state">No transactions found.</div>`;
    return;
  }
  el.innerHTML = shown.map(tx => `
    <div class="tx-row">
      <span class="tx-date">${tx.date}</span>
      <span class="tx-desc">${tx.description}</span>
      <span class="tx-cat">${tx.category || "Other"}</span>
      <span class="tx-acct">${tx.account}</span>
      <span class="tx-amount ${tx.type}">${tx.type === "debit" ? "-" : "+"}${formatMoney(Math.abs(tx.amount))}</span>
    </div>
  `).join("");
}

function populateCategoryFilter() {
  const cats = [...new Set(allTransactions.map(t => t.category).filter(Boolean))].sort();
  const sel = document.getElementById("tx-category-filter");
  sel.innerHTML = `<option value="">All categories</option>` +
    cats.map(c => `<option value="${c}">${c}</option>`).join("");
}

document.getElementById("tx-search").addEventListener("input", e => {
  renderTransactions(e.target.value, document.getElementById("tx-category-filter").value);
});
document.getElementById("tx-category-filter").addEventListener("change", e => {
  renderTransactions(document.getElementById("tx-search").value, e.target.value);
});

// --- Summary / Charts ---
async function loadSummary() {
  const months = document.getElementById("summary-months").value;
  try {
    const res = await fetch(`${WORKER_URL}/finance/summary?months=${months}`);
    const data = await res.json();
    renderCategoryChart(data.byCategory || []);
    renderMonthlyChart(data.byMonth || []);
    renderTaxEstimate(data);
    document.getElementById("monthly-spending").textContent = formatMoney(data.totalSpent / months);
  } catch (e) {
    console.error("Summary error:", e);
  }
}

document.getElementById("summary-months").addEventListener("change", loadSummary);

function renderCategoryChart(categories) {
  const el = document.getElementById("category-chart");
  if (categories.length === 0) { el.innerHTML = `<div class="empty-state">No data yet.</div>`; return; }
  const max = categories[0].amount;
  el.innerHTML = categories.slice(0, 8).map(c => `
    <div class="cat-row">
      <span class="cat-label">${c.category}</span>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${Math.round(c.amount/max*100)}%"></div></div>
      <span class="cat-amount">${formatMoney(c.amount)}</span>
    </div>
  `).join("");
}

function renderMonthlyChart(months) {
  const el = document.getElementById("monthly-chart");
  if (months.length === 0) { el.innerHTML = `<div class="empty-state">No data yet.</div>`; return; }
  const max = Math.max(...months.map(m => m.amount));
  el.innerHTML = `<div class="month-row">` +
    months.map(m => `
      <div class="month-col">
        <div class="month-bar" style="height:${Math.round(m.amount/max*80)}px" title="${formatMoney(m.amount)}"></div>
        <span class="month-label">${m.month.slice(5)}</span>
      </div>
    `).join("") + `</div>`;
}

function renderTaxEstimate(data) {
  document.getElementById("tax-income").textContent = formatMoney(data.totalIncome || 0);
  document.getElementById("tax-owed").textContent = formatMoney(data.taxEstimate || 0);
}

// --- Goals ---
async function loadGoals() {
  try {
    const res = await fetch(`${WORKER_URL}/finance/goals`);
    const data = await res.json();
    renderGoals(data.goals || []);
  } catch (e) { console.error("Goals error:", e); }
}

function renderGoals(goals) {
  const el = document.getElementById("goals-list");
  if (goals.length === 0) {
    el.innerHTML = `<div class="empty-state">No goals yet. Add one to start tracking.</div>`;
    return;
  }
  el.innerHTML = goals.map(g => {
    const pct = g.current ? Math.min(100, Math.round(g.current / g.amount * 100)) : 0;
    return `
      <div class="goal-row">
        <div class="goal-header">
          <span class="goal-name">${g.name}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="goal-meta">${formatMoney(g.current || 0)} / ${formatMoney(g.amount)}</span>
            <button class="goal-delete" onclick="deleteGoal('${g.id}')">✕</button>
          </div>
        </div>
        <div class="goal-bar-wrap"><div class="goal-bar" style="width:${pct}%"></div></div>
      </div>
    `;
  }).join("");
}

async function deleteGoal(id) {
  await fetch(`${WORKER_URL}/finance/goals/${id}`, { method: "DELETE" });
  loadGoals();
}

// Goal modal
document.getElementById("add-goal-btn").addEventListener("click", () => openModal("goal-modal"));
document.getElementById("goal-cancel").addEventListener("click", closeModal);
document.getElementById("goal-save").addEventListener("click", async () => {
  const name = document.getElementById("goal-name").value.trim();
  const amount = parseFloat(document.getElementById("goal-amount").value);
  const category = document.getElementById("goal-category").value.trim();
  const targetDate = document.getElementById("goal-date").value;
  if (!name || !amount) return;
  await fetch(`${WORKER_URL}/finance/goals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, amount, category, targetDate }),
  });
  closeModal();
  loadGoals();
});

// Manual entry modal
document.getElementById("manual-entry-btn").addEventListener("click", () => openModal("manual-modal"));
document.getElementById("manual-cancel").addEventListener("click", closeModal);

let manualEntryType = "transaction";
document.querySelectorAll(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    manualEntryType = btn.dataset.type;
    document.getElementById("manual-transaction-form").style.display = manualEntryType === "transaction" ? "flex" : "none";
    document.getElementById("manual-account-form").style.display = manualEntryType === "account" ? "flex" : "none";
    document.getElementById("manual-transaction-form").style.flexDirection = "column";
    document.getElementById("manual-transaction-form").style.gap = "12px";
  });
});

document.getElementById("manual-save").addEventListener("click", async () => {
  let body;
  if (manualEntryType === "transaction") {
    body = {
      type: "transaction",
      date: document.getElementById("manual-date").value,
      description: document.getElementById("manual-desc").value,
      amount: document.getElementById("manual-amount").value,
      type2: document.getElementById("manual-type").value,
      category: document.getElementById("manual-category").value,
    };
    body.type = "transaction";
    body.transactionType = body.type2;
    delete body.type2;
  } else {
    body = {
      type: "account",
      name: document.getElementById("manual-acct-name").value,
      institution: document.getElementById("manual-acct-inst").value,
      balance: document.getElementById("manual-acct-balance").value,
      accountType: document.getElementById("manual-acct-type").value,
    };
  }
  await fetch(`${WORKER_URL}/finance/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  closeModal();
  loadFinanceData();
});

// Modal helpers
function openModal(id) {
  document.getElementById("modal-overlay").classList.add("open");
  document.getElementById(id).classList.add("open");
}
function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.querySelectorAll(".modal").forEach(m => m.classList.remove("open"));
}
document.getElementById("modal-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
});

// --- Utilities ---
function formatMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Set default manual date to today
document.getElementById("manual-date").value = new Date().toISOString().slice(0, 10);

// Load finance data when switching to finance tab
document.querySelectorAll(".nav-btn").forEach(btn => {
  if (btn.dataset.section === "budget") {
    btn.addEventListener("click", loadFinanceData);
  }
});
