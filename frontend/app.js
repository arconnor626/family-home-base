// ============================================================================
// Connor Family Hub - Main App (With Teller Integration)
// ============================================================================

const WORKER_URL = "https://family-home-base.arconnor626.workers.dev";
const TELLER_CLIENT_ID = "app_635eb652ce934e498e913155fe2d4a56"; // From Teller console
const TELLER_REDIRECT_URI = window.location.origin + window.location.pathname + "?teller_callback=true";

// Constants
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// State
let currentWeekOffset = 0;
let allEvents = [];
let tellerToken = null;
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
                            saveTellerToken(enrollment.id);
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
// DISPLAY UPDATES
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
    document.querySelector('[data-net-worth]').textContent =
          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(summary.total_balance);
    document.querySelector('[data-total-assets]').textContent =
          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(summary.total_balance);
    document.querySelector('[data-total-debt]').textContent = '$0.00'; // Implement debt tracking separately
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
// CALENDAR
// ============================================================================

function loadGoogleCalendarEvents() {
    // This is your existing Google Calendar code - keep it as is
  // Call your existing Google Calendar fetch functions here
}

function renderCalendar() {
    // Your existing calendar rendering code
}

function renderTodayEvents() {
    // Your existing today's events rendering code
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
    initTellerOAuth();
    loadGoogleCalendarEvents();
    renderCalendar();
    renderTodayEvents();

                            // Connect Bank button
                            document.querySelector('[data-connect-bank]')?.addEventListener('click', openTellerConnect);

                            // Sync button for manual refresh
                            document.querySelector('[data-finance-sync]')?.addEventListener('click', async () => {
                                  if (tellerEnrollmentId) {
                                          await fetch(`${WORKER_URL}/finance/sync`, {
                                                    method: 'POST',
                                                    headers: { 'X-Teller-Token': tellerEnrollmentId }
                                          });
                                          fetchFinanceData();
                                  }
                            });
});
