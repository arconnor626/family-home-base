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
