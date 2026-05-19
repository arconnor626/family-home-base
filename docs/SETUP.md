# Connor Family Hub — Setup Guide

This guide covers getting the project from the Phase 0 skeleton to a working
local development setup, and the Cloudflare configuration needed for deployment.

> **Phase 0 scope:** this guide gets the *plumbing* ready. No features exist
> yet. Auth is built in Phase 1. Do not deploy a public site until Phase 1 has
> gated it — see `STATE.md` and the plan's phase ordering.

---

## 0. Prerequisites

- **Git** — already installed (Git Bash on the desktop).
- **Node.js** — required for Wrangler. Install the current LTS release if not
  already present.
- **Wrangler** — the Cloudflare CLI. Installed per-project in step 3.
- A **Cloudflare account** (already have one) and the **GitHub repo**
  `family-home-base` (already exists).

## 1. Place the skeleton files

One-time manual step. Put the generated files where they belong:

- The **vault folder** (`PROJECT_PLAN.md`, `PROJECT_LOG.md`, `DECISIONS.md`)
  into the Google Drive folder `Connor Family Hub/`, and open that folder as a
  vault in Obsidian.
- The **repo files** (`README.md`, `STATE.md`, `public/`, `worker/`, `docs/`)
  into the local clone of `family-home-base`.

After this, all further work happens in Claude Code, which writes these files
directly — no more manual placement.

## 2. Commit the skeleton

From the repo root in Git Bash:

```bash
git add .
git commit -m "Phase 0: project skeleton, config, and setup guide"
git push
```

## 3. Install Wrangler and test the Worker locally

From the `worker/` directory:

```bash
npm install --save-dev wrangler
npx wrangler --version
```

Local development (once the Worker has code, from Phase 1 onward):

```bash
npx wrangler dev
```

This serves the Worker at `http://localhost:8787` using a local KV simulation —
no production data is touched.

## 4. Create the KV namespace

From the `worker/` directory:

```bash
npx wrangler kv namespace create FAMILY_HUB_KV
```

Note: Wrangler 3.60.0 and later use this space-separated syntax. Older versions
use the colon form `wrangler kv:namespace create FAMILY_HUB_KV`.

The command prints a namespace `id`. Copy it into `worker/wrangler.toml`,
replacing the `TODO-paste-kv-namespace-id-here` placeholder in the
`[[kv_namespaces]]` block.

## 5. Connect Cloudflare Pages to the GitHub repo

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
Git**, and select the `family-home-base` repo.

Build settings — this is plain HTML/CSS/JS with no build step:

- **Framework preset:** None
- **Build command:** *(leave empty)*
- **Build output directory:** `public`

Cloudflare assigns a `*.pages.dev` URL and redeploys automatically on every
`git push`. A custom domain can be attached later.

> The frontend and the Worker deploy separately. Pages deploys on `git push`;
> the Worker deploys via `npx wrangler deploy` from the `worker/` directory.

## 6. Secrets

Secrets are never committed to the repo. When Phase 1 introduces a
session-signing key (and later, OAuth credentials), set them with:

```bash
npx wrangler secret put <SECRET_NAME>
```

## Resume point

With the skeleton placed, committed, and the KV namespace created, the project
is ready for **Phase 1 — authentication**. See `PROJECT_PLAN.md` section 4.
