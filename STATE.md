# STATE — Connor Family Hub

> **If you are a new Claude thread or a person picking this project up, read this
> file first.** It is the in-repo breadcrumb. The substantive planning documents
> live in the Obsidian vault (see below).

## Where the real documents are

The canonical project documents live in an Obsidian vault inside a synced
folder (`Connor Family Hub/` in Google Drive):

- **`PROJECT_PLAN.md`** — canonical plan, architecture, phased roadmap
- **`DECISIONS.md`** — locked decisions and their rationale (read this to avoid
  relitigating settled choices)
- **`PROJECT_LOG.md`** — append-only session log; the newest entry is the bottom

If you have the Google Drive connector, search for those filenames. If you do
not, this file plus the repo are still enough to resume safely.

## Project in one paragraph

The Connor Family Hub is a private, access-controlled web hub for family
schedules, budgets, projects, tasks, reminders, and notes. Frontend on
Cloudflare Pages, backend on a Cloudflare Worker, storage in Cloudflare KV. The
existing site at `arconnor626.github.io/family-home-base` is a working
single-page app (schedule + finance views) with no backend — the project adds a
secure backend and access control to it.

## Current phase

**Phase 5 — COMPLETE.** Google Calendar OAuth2 sync, CSV transaction import, and
Teller bank account integration are all live.

## Deployed URLs

- **Frontend:** `https://master.connor-family-hub-v2.pages.dev` (Cloudflare Pages, `public/`)
- **Worker:** `https://connor-family-hub.arconnor626.workers.dev` (Cloudflare Worker)
- **KV namespace:** `FAMILY_HUB_KV` — id `33a7160b8d84400c87051ce1ebbaf75e`

## What is deployed

- Login page (`public/login.html`) — gates the entire site
- Full app shell (`public/index.html`) — Dashboard, Schedule, Finance, Tasks, Projects, Admin
- `public/js/app.js` — all sections + CRUD for all data types; lazy-load pattern; view picker
- `public/css/style.css` — complete app styles including all Phase 4/5 components
- Worker auth routes: `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`
- `GET /users` — returns `[{ id, name }]` for all users (any authenticated user)
- Worker schedule routes: `GET/POST /schedule/events`, `PUT/DELETE /schedule/events/:id`
- Worker finance routes: `GET/POST /finance/accounts`, `PUT/DELETE /finance/accounts/:id`
  `GET/POST /finance/transactions`, `DELETE /finance/transactions/:id`
  `GET/POST /finance/goals`, `PUT/DELETE /finance/goals/:id`
  `GET /finance/summary`
  `GET/POST /finance/budget-categories`, `PUT/DELETE /finance/budget-categories/:id`
- Worker task routes: `GET/POST /tasks`, `PUT/DELETE /tasks/:id`
- Worker project routes: `GET/POST /projects`, `PUT/DELETE /projects/:id`
- Worker note routes: `GET/POST /notes`, `DELETE /notes/:id`
- Worker integration routes (Google Calendar):
  `GET /integrations/google/auth`, `GET /integrations/google/callback`,
  `GET /integrations/google/status`, `POST /integrations/google/sync`,
  `PUT /integrations/google/calendars`, `GET /integrations/google/calendars`,
  `DELETE /integrations/google/disconnect`
- Worker Teller routes (bank account integration):
  `GET /integrations/teller/enrollments`,
  `POST /integrations/teller/enroll`,
  `POST /integrations/teller/sync`,
  `DELETE /integrations/teller/enrollments/:id`
- Worker admin routes (admin role only): `GET/POST /admin/users`,
  `PUT/DELETE /admin/users/:username`
- PBKDF2 password hashing (100k iterations, SHA-256), 7-day KV-backed sessions
- Two user accounts seeded: Alex (admin) and Jen (parent)

## Exact next action

**Finance is the top priority.** The next focus is enhanced budget analysis and
planning features:
- Month-over-month spending comparison by category
- Budget vs. actual trend charts / forecast
- Monthly check-in workflow (review prior month, plan ahead)

After that: Phase 6 — Records integration (document storage + AI/natural-language search).
Read `PROJECT_PLAN.md` for scope. Re-read `DECISIONS.md` (especially D15, D16) before starting.

## Pending setup steps

**Teller (bank integration):**
- `TELLER_APP_ID` secret: ✅ set
- `TELLER_CERT` mTLS binding: ✅ bound (certificate ID `92b69536-800c-4604-8822-736e5187342a`)
- `TELLER_TOKEN_SIGNING_KEY` secret: ⏳ optional — add for Ed25519 enrollment verification:
  ```
  npx wrangler secret put TELLER_TOKEN_SIGNING_KEY
  ```
  Paste the Ed25519 public key from teller.io → Settings → Application.

**Google Calendar:**
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: add as Worker secrets if not done:
  ```
  npx wrangler secret put GOOGLE_CLIENT_ID
  npx wrangler secret put GOOGLE_CLIENT_SECRET
  ```
  Register redirect URI in Google Cloud Console:
  `https://connor-family-hub.arconnor626.workers.dev/integrations/google/callback`

## Deploy commands

```
# Worker
cd worker && npx wrangler deploy

# Frontend
npx wrangler pages deploy public/ --project-name connor-family-hub-v2 --commit-dirty=true
```

## Environment note

Building happens in Claude Code on the desktop (direct filesystem + vault
access). The Claude chat interface is for planning only — it cannot write to the
local filesystem.
