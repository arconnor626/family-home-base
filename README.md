# Connor Family Hub

A private, access-controlled web hub for the Connor family — schedules, budgets,
projects, tasks, reminders, and shared notes in one place.

## Status

**Phase 0 — skeleton.** Project structure and configuration are in place. No
features are built yet. See `STATE.md` for where to resume.

## Architecture

- **Frontend** — static HTML/CSS/JS, hosted on Cloudflare Pages, auto-deployed
  on `git push`. Lives in `public/`.
- **Backend** — a Cloudflare Worker handling authentication, sessions, role
  checks, and all data access. Lives in `worker/`.
- **Storage** — Cloudflare KV.

The frontend never touches data directly; it calls the Worker, which enforces
access control.

## Repository layout

```
family-home-base/
├── README.md            this file
├── STATE.md             handoff breadcrumb — read first when resuming
├── public/              frontend (Cloudflare Pages serves this)
│   ├── css/
│   └── js/
├── worker/              backend (Cloudflare Worker)
│   ├── src/
│   │   └── routes/
│   └── wrangler.toml
└── docs/
    └── SETUP.md         Cloudflare + deployment setup guide
```

## Project documents

The canonical plan, the decisions log, and the session log live in an Obsidian
vault in Google Drive (`Connor Family Hub/`), not in this repo. `STATE.md`
points to them. This keeps planning docs easy to read and edit while the repo
stays focused on code.

## Setup

See `docs/SETUP.md` for Cloudflare Pages, Worker, and KV setup, and local
development with Wrangler.
