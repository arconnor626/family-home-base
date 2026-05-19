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

**Phase 1 — COMPLETE.** Authentication is fully deployed and live.

## Deployed URLs

- **Frontend:** `https://master.connor-family-hub-v2.pages.dev` (Cloudflare Pages, `public/`)
- **Worker:** `https://connor-family-hub.arconnor626.workers.dev` (Cloudflare Worker)
- **KV namespace:** `FAMILY_HUB_KV` — id `33a7160b8d84400c87051ce1ebbaf75e`

## What is deployed

- Login page (`public/login.html`) — gates the entire site
- App shell (`public/index.html`) — requires valid session to load
- Worker auth routes: `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`
- PBKDF2 password hashing (100k iterations, SHA-256), 7-day KV-backed sessions
- Two user accounts seeded: Alex (admin) and Jen (parent)

## Exact next action

Begin **Phase 2** — the first feature module. Read `PROJECT_PLAN.md` for the
Phase 2 scope. Re-read `DECISIONS.md` before starting to avoid relitigating
settled choices.

To redeploy after changes:
- **Worker:** `wrangler deploy` from `worker/`
- **Frontend:** `wrangler pages deploy public/ --project-name connor-family-hub-v2` from repo root

## Environment note

Building happens in Claude Code on the desktop (direct filesystem + vault
access). The Claude chat interface is for planning only — it cannot write to the
local filesystem.
