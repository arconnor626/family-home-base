# Family Home Base

A unified family data hub with schedules, budgets, projects, and AI-ready storage.

## Architecture
- Frontend: HTML/CSS/JS on GitHub Pages
- Backend: Cloudflare Worker (managed via Cloudflare Dashboard)
- Data: Cloudflare KV storage
- Integrations: Google Calendar, PayPal

## Setup
1. Create a Worker at dash.cloudflare.com > Workers & Pages
2. Paste worker code from worker/src/index.js into the dashboard editor
3. Create KV namespaces in the dashboard and bind them to the Worker
4. Host frontend/ on GitHub Pages

## Structure
- frontend/ - HTML/CSS/JS UI
- worker/src/ - Cloudflare Worker code (source of truth, deployed via dashboard)

## Status
Early development - foundation phase
