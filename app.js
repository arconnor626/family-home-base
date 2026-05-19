// ============================================================================
// Connor Family Hub - Main App (Calendar + Teller Finance Integration)
// ============================================================================

const WORKER_URL = "https://family-home-base.arconnor626.workers.dev";
const TELLER_CLIENT_ID = "app_635eb652ce934e498e913155fe2d4a56"; // From Teller console

// Constants
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// State
let currentWeekOffset = 0;
let allEvents = [];
let tellerEnrollmentId = null;
let tellerAccounts = [];

// ============================================================================
// TELLER OAUTH & TOKEN MANAGEMENT
// ============================================================================

function initTellerOAuth() {
  // Check if returning from Teller OAuth
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('teller_callback') === 'true') {
    const enrollment = urlParams.get('enrollment_id');
    if (enrollment) {
      saveTellerToken(enrollment);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // Try to restore saved token
  const saved = localStorage.getItem('teller_enrollment_id');
  if (saved) {
    tellerEnrollmentId = saved;
    fetchFinanceData();
  }
}

function saveTellerToken(enrollmentId) {
  tellerEnrollmentId = enrollmentId;
  localStorage.setItem('teller_enrollment_id', enrollmentId);

  // Notify Worker of new enrollment
  fetch(`${WORKER_URL}/finance/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollment_id: enrollmentId })
  }).catch(err => console.error('Failed to notify Worker of enrollment:', err));

  fetchFinanceData();
}

function openTellerConnect() {
  // Open Teller Connect modal
  const tellerScript = document.createElement('script');
  tellerScript.src = 'https://cdn.teller.io/sdk/app.js';
  tellerScript.onload = () => {
    Teller.connect({
      applicationId: TELLER_CLIENT_ID,
      onSuccess: (enrollment) => {
        console.log('Teller enrollment received:', enrollment);
        // Handle both id and enrollment_id property names
        const enrollmentId = enrollment.enrollment_id || enrollment.id;
        if (enrollmentId) {
          saveTellerToken(enrollmentId);
        } else {
          console.error('No enrollment ID found in Teller response:', enrollment);
          alert('Failed to extract enrollment ID. Please try again.');
        }
      },
      onFailure: (error) => {
        console.error('Teller Connect failed:', error);
        alert('Failed to connect bank. Please try again.');
      }
    });
  };
  document.head.appendChild(tellerScript);
}

// ============================================================================
// FINANCE DATA FETCHING
// ============================================================================

async function fetchFinanceData() {
  if (!tellerEnrollmentId) return;

  try {
    // Fetch accounts
    const accountsRes = await fetch(`${WORKER_URL}/finance/accounts`, {
      headers: { 'X-Teller-Token': tellerEnrollmentId }
    });
    if (accountsRes.ok) {
      tellerAccounts = await accountsRes.json();
      updateAccountsDisplay();
    }

    // Fetch summary
    const summaryRes = await fetch(`${WORKER_URL}/finance/summary`, {
      headers: { 'X-Teller-Token': tellerEnrollmentId }
    });
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      updateSummaryDisplay(summary);
    }

    // Fetch transactions for each account
    for (const account of tellerAccounts) {
      const txRes = await fetch(`${WORKER_URL}/finance/transactions?account_id=${account.id}`, {
        headers: { 'X-Teller-Token': tellerEnrollmentId }
      });
      if (txRes.ok) {
        const txData = await txRes.json();
        updateTransactionsDisplay(account.id, txData.transactions);
      }
    }

    // Fetch goals
    const goalsRes = await fetch(`${WORKER_URL}/finance/goals`);
    if (goalsRes.ok) {
      const goals = await goalsRes.json();
      updateGoalsDisplay(goals);
    }
  } catch (error) {
    console.error('Error fetching finance data:', error);
  }
}

// ============================================================================
// FINANCE DISPLAY UPDATES
// ============================================================================

function updateAccountsDisplay() {
  const accountsList = document.querySelector('[data-accounts-list]');
  if (!accountsList) return;

  if (tellerAccounts.length === 0) {
    accountsList.innerHTML = '<p>No accounts connected. Click "+ Connect Bank" to get started.</p>';
    return;
  }

  accountsList.innerHTML = tellerAccounts.map(account => `
    <div class="account-card">
      <div class="account-header">
        <h4>${account.name}</h4>
        <span class="account-type">${account.subtype}</span>
      </div>
      <div class="account-balance">
        ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(account.balances.current)}
      </div>
      <small>${account.institution.name}</small>
    </div>
  `).join('');
}

function updateSummaryDisplay(summary) {
  const netWorthEl = document.querySelector('[data-net-worth]');
  const assetsEl = document.querySelector('[data-total-assets]');
  const debtEl = document.querySelector('[data-total-debt]');

  if (netWorthEl) netWorthEl.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(summary.total_balance);
  if (assetsEl) assetsEl.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(summary.total_balance);
  if (debtEl) debtEl.textContent = '$0.00';
}

function updateTransactionsDisplay(accountId, transactions) {
  const txList = document.querySelector('[data-transactions-list]');
  if (!txList) return;

  const sorted = transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);

  txList.innerHTML = sorted.map(tx => `
    <div class="transaction">
      <div class="tx-left">
        <span class="tx-description">${tx.description}</span>
        <span class="tx-category">${tx.category || 'Uncategorized'}</span>
      </div>
      <span class="tx-amount ${tx.amount < 0 ? 'expense' : 'income'}">
        ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tx.amount)}
      </span>
      <span class="tx-date">${new Date(tx.date).toLocaleDateString()}</span>
    </div>
  `).join('');
}

function updateGoalsDisplay(goals) {
  const goalsList = document.querySelector('[data-goals-list]');
  if (!goalsList) return;

  if (goals.length === 0) {
    goalsList.innerHTML = '<p>No goals yet. Add one to start tracking.</p>';
    return;
  }

  goalsList.innerHTML = goals.map(goal => {
    const percent = goal.target > 0 ? (goal.current / goal.target) * 100 : 0;
    return `
      <div class="goal-card">
        <div class="goal-header">
          <h4>${goal.name}</h4>
          <span class="goal-percent">${percent.toFixed(0)}%</span>
        </div>
        <div class="goal-progress">
          <div class="progress-bar" style="width: ${percent}%"></div>
        </div>
        <div class="goal-amounts">
          <span>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(goal.current)}</span>
          <span>of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(goal.target)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// CALENDAR FUNCTIONS
// ============================================================================

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

function renderCalendar() {
  const weekStart = getWeekStart(currentWeekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  document.getElementById("week-label").textContent =
    `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
      eDate.setHours(0, 0, 0, 0);
      return eDate.getTime() === day.getTime();
    }).sort((a, b) => new Date(a.start) - new Date(b.start));

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

function renderToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayEvents = allEvents.filter(e => {
    const eDate = new Date(e.start);
    eDate.setHours(0, 0, 0, 0);
    return eDate.getTime() === today.getTime();
  }).sort((a, b) => new Date(a.start) - new Date(b.start));

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

function updateHeaderDate() {
  const now = new Date();
  document.getElementById("current-date").textContent =
    `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

// ============================================================================
// NAVIGATION
// ============================================================================

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));

    btn.classList.add("active");
    const section = btn.dataset.section;
    document.querySelector(`[data-section="${section}"]`).classList.add("active");

    // Load finance data when Finance tab is clicked
    if (section === "finance" && tellerEnrollmentId) {
      fetchFinanceData();
    }
  });
});

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  updateHeaderDate();
  initTellerOAuth();
  fetchEvents();

  // Week navigation
  document.getElementById("prev-week").addEventListener("click", () => { currentWeekOffset--; renderCalendar(); });
  document.getElementById("next-week").addEventListener("click", () => { currentWeekOffset++; renderCalendar(); });

  // Connect Bank button
  const connectBtn = document.querySelector('[data-connect-bank]');
  if (connectBtn) {
    connectBtn.addEventListener('click', openTellerConnect);
  }

  // Finance tab button (for Teller Connect)
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.section === 'finance') {
      btn.addEventListener('click', () => {
        if (tellerEnrollmentId) {
          fetchFinanceData();
        }
      });
    }
  });

  // Sync button for manual refresh
  const syncBtn = document.querySelector('[data-finance-sync]');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      if (tellerEnrollmentId) {
        await fetch(`${WORKER_URL}/finance/sync`, {
          method: 'POST',
          headers: { 'X-Teller-Token': tellerEnrollmentId }
        });
        fetchFinanceData();
      }
    });
  }
});
