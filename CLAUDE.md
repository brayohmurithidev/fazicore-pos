# FaziCore POS — CLAUDE.md

Multi-tenant Point of Sale for Fazilabs Technologies. Ships as a **Tauri desktop app** (Windows + macOS) and a web build. Billing/subscriptions are handled by the central **Fazilabs Invoicing System** (separate repo) — this app is the **access/feature source of truth**.

## Stack

- **Backend:** FastAPI + PostgreSQL (asyncpg/SQLAlchemy 2) + Alembic + Redis + Celery + MinIO
- **Frontend:** Vite + React 19 + Tailwind v4 + React Router v7 + TanStack Query + Zustand
- **Desktop:** Tauri 2 (Rust) — custom titlebar (`decorations: false`), auto-updater, offline SQLite, thermal printing
- **Multi-tenancy:** org-scoped; requests carry `X-Org-Slug` header + Bearer JWT

## Key paths

- Backend: `backend/app/` — migrations in `backend/migrations/versions/`
- Frontend: `frontend/src/`
- Tauri (Rust): `frontend/src-tauri/` — `src/lib.rs` (commands), `tauri.conf.json`, `capabilities/default.json`
- Thermal printing: `frontend/src/lib/escpos.ts` (ESC/POS), `tauri-cups.ts`/`tauri-serial.ts` (transports), Rust `print_raw_cups`/`list_system_printers` in `lib.rs`

## Running locally

```bash
# Backend (from backend/)
docker compose up -d

# Frontend web (from frontend/)
pnpm dev

# Desktop dev
pnpm tauri:dev
```

## Deployment

- **Backend:** push to `main` touching `backend/**` → `backend.yml` builds image to GHCR, SSH-deploys to VPS, runs `alembic upgrade head` on startup (`entrypoint.sh`). Lives at `fazistore-api.fazilabs.com`.
- **Desktop:** `git tag vX.Y.Z && git push origin vX.Y.Z` → `release-desktop.yml` builds signed macOS + Windows installers as a **draft** GitHub release. Auto-updater pulls from `releases/latest/download/latest.json`.
- **Web admin:** Vercel → `admin.fazistore.fazilabs.com`. Prod API URL injected via `.env.production` in CI (the committed `.env` points at localhost for dev only).

## Release prerequisites (GitHub secrets)

- `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — **required** (updater pubkey is baked into `tauri.conf.json`; build fails without the private key)
- `APPLE_*` — optional; without them macOS builds are unsigned (Gatekeeper warning). Windows is unsigned (SmartScreen warning).

## Central billing integration (Fazilabs Invoicing)

The invoicing system owns invoices/payments; POS owns plans, limits, features, org status.

- **Outbound** (POS → billing): `set_org_subscription` (`admin.py`) calls `notify_org_onboarded` (`services/billing_webhook.py`) → billing creates client + subscription + first invoice. Env: `BILLING_ONBOARD_URL`, `BILLING_WEBHOOK_SECRET` (in `.env`).
- **Inbound** (billing → POS): `POST /api/v1/hooks/billing` (`api/v1/hooks.py`) — HMAC-signed with `BILLING_WEBHOOK_SECRET`. `subscription.activated` → org ACTIVE; `subscription.past_due` → org SUSPENDED.
- Billing matches orgs by `external_ref` = `pos:<org_slug>`.

## Thermal printing (80mm)

ESC/POS via two transports, chosen in Settings:
- **System Printer** (`printerMode: 'cups'`) — raw bytes to an installed printer. Windows: print spooler (winspool, `print_raw_windows` in `lib.rs`); macOS/Linux: `lp -o raw`. Printer list via `Get-Printer` (Windows) / `lpstat` (Unix).
- **Serial / COM** — for USB-serial printers via the serialplugin.
- Also a fallback HTML print path (`lib/print.ts` → `open_html_preview`).
- **Windows USB 80mm is the primary client setup** (added in v1.2.0). Validate any winspool change with the CI Windows build + a physical test print (can't be tested from macOS).

## Mpesa / payments

- Customer-facing C2B + STK callbacks: `api/v1/hooks.py` at `/hooks/{org_slug}/...` (neutral path — Daraja rejects URLs containing "mpesa"/"safaricom"/"sql"/etc.).

## Conventions

- Forms use react-hook-form + zod (matches the invoicing system).
- Don't add `Co-Authored-By` to commits.
