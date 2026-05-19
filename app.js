const WORKER_URL = "https://family-home-base.arconnor626.workers.dev";
const TELLER_CLIENT_ID = "app_635eb652ce934e498e913155fe2d4a56";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

let currentWeekOffset = 0;
let allEvents = [];
let tellerEnrollmentId = null;
let tellerAccounts = [];

// TELLER FUNCTIONS
function initTellerOAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('teller_callback') === 'true') {
    const enrollment = urlParams.get('enrollment_id');
    if (enrollment) {
      saveTellerToken(enrollment);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
  const saved = localStorage.getItem('teller_enrollment_id');
  if (saved) {
    tellerEnrollmentId = saved;
    fetchFinanceData();
  }
}

function saveTellerToken(enrollmentId) {
  tellerEnrollmentId = enrollmentId;
  localStorage.setItem('teller_enrollment_id', enrollmentId);
  fetch(`${WORKER_URL}/finance/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollment_id: enrollmentId })
  }).catch(err => console.error('Failed to notify Worker:', err));
  fetchFinanceData();
}

function openTellerConnect() {
  const tellerScript = document.createElement('script');
  tellerScript.src = 'https://cdn.teller.io/sdk/app.js';
  tellerScript.onload = () => {
    Teller.connect({
      applicationId: TELLER_CLIENT_ID,
      onSuccess: (enrollment) => {
        console.log('Teller enrollment:', enrollment);
        const enrollmentId = enrollment.enrollment_id || enrollment.id;
        if (enrollmentId) {
          saveTellerToken(enrollmentId);
        } else {
          console.error('No enrollment ID:', enrollment);
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

async function fetchFinanceData() {
  if (!tellerEnrollmentId) return;
  try {
    const accountsRes = await fetch(`${WORKER_URL}/finance/accounts`, {
      headers: { 'X-Teller-Token': tellerEnrollmentId }
    });
    if (accountsRes.ok) {
      tellerAccounts = await accountsRes.json();
      updateAccountsDisplay();
    }
    const summaryRes = await fetch(`${WORKER_URL}/finance/summary`, {
      headers: { 'X-Teller-Token': tellerEnrollmentId }
    });
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      updateSummaryDisplay(summary);
    }
  } catch (error) {
    console.error('Error fetching finance data:', error);
  }
}

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
  if (netWorthEl) netWorthEl.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(summary.total_balance);
  if (assetsEl) assetsEl.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(summary.total_balance);
}

// CALENDAR FUNCTIONS
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    btn.classList.add("active");
    const section = btn.dataset.section;
    document.querySelector(`[data-section="${section}"]`).classList.add("active");
    if (section === "finance" && tellerEnrollmentId) {
      fetchFinanceData();
    }
  });
});

function updateHeaderDate() {
  const now = new Date();
  document.getElementById("current-date").textContent =
    `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

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

async function fetchEvents() {
  try {
    const weekStart = getWeekStart(-1);
    const weekEnd = getWeekStart(4);
    const res = await fetch(`${WORKER_URL}/events?start=${weekStart.toISOString()}&end=${weekEnd.toISOString()}`);
    if (!res.ok) throw new Error("Worker error");
    const data = await res.json();
    allEvents = data.events || [];
  } catch {
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

// INITIALIZATION
updateHeaderDate();
initTellerOAuth();
fetchEvents();

const connectBtn = document.querySelector('[data-connect-bank]');
if (connectBtn) {
  connectBtn.addEventListener('click', openTellerConnect);
}
Fix: restore working calendar and Teller integration (290 lines)
