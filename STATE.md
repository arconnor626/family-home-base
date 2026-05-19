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

**Phase 1 — authentication.** Login page, Worker auth routes, session tokens,
and user seed script are built. KV namespace creation and user seeding still
required before the site can be tested end-to-end.

## Exact next action

1. Create the KV namespace (if not done): from `worker/`, run
   `npx wrangler kv namespace create FAMILY_HUB_KV` and paste the returned `id`
   into `worker/wrangler.toml`.
2. Seed the two user accounts: `node scripts/create-users.js` (from `worker/`),
   then run the printed `wrangler kv key put` commands.
3. Test locally: `npx wrangler dev` in `worker/`, serve `public/` on a second
   port (e.g. VS Code Live Server), open `login.html`.
4. Deploy: `npx wrangler deploy` for the Worker; `git push` to redeploy Pages.
5. Update the TODO `WORKER_URL` in `public/js/auth.js` with the deployed Worker
   URL, then `git push` again.
6. Begin Phase 2 when ready.

## Environment note

Building happens in Claude Code on the desktop (direct filesystem + vault
access). The Claude chat interface is for planning only — it cannot write to the
local filesystem.
