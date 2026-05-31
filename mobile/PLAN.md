# FaziPOS Mobile — Build Plan (Flutter, Android)

Mobile client for FaziCore POS. The FastAPI backend (`backend/`) is reused as-is —
mobile is just another HTTP client (no CORS concerns; native Dio isn't subject to it).
Auth is the same **slug → users → PIN** flow with JWT + `X-Org-Slug` header.

## Decisions
- **Platform:** Android only (most KE retail hardware; no Apple account needed).
- **Approach:** phased — **companion first**, then grow into a full mobile POS.
- **Offline:** Phase 1 (companion) is **online-only**; Phase 2 (full POS) is **offline-first**.
- **Printing:** Bluetooth thermal (58/80mm) via ESC/POS in Phase 2.

## Stack
| Concern | Choice |
|---|---|
| State | Riverpod (`flutter_riverpod`) |
| Networking | Dio + interceptors (JWT refresh, `X-Org-Slug`) |
| Routing | go_router |
| Secure storage | flutter_secure_storage (JWT/refresh/slug) |
| Charts (companion) | fl_chart |
| Offline DB (Phase 2) | drift (SQLite) + sync queue |
| Bluetooth printing (Phase 2) | print_bluetooth_thermal + esc_pos_utils_plus |
| Barcode (Phase 2) | mobile_scanner |

## Phase 1 — Companion (online-only)  ← this scaffold
Owner/manager monitors + lightly manages the shop.
- Login (slug → pick user → PIN)         ✅ scaffolded
- Dashboard (today revenue, txns, low stock, top products)  ✅ scaffolded
- Products (list, add/edit)
- Sales (order list + detail)
- Inventory (view + adjust)
- Reports (sales trend, by product — fl_chart)
- Customers (list/detail)

## Phase 2 — Full mobile POS (offline-first + Bluetooth printing)
- Local DB (drift): cache catalog/customers, queue pending sales
- Sync engine: pull catalog on connect, push queued sales (same API as desktop sync)
- Sell screen: cart, cash / M-Pesa STK / split / credit
- Bluetooth thermal printing (same ESC/POS receipt layout as desktop)
- Barcode scanning (phone camera)

## Distribution
Flutter → APK/AAB. Direct APK sideload for shops, or Play Store ($25 one-time).
A GitHub Actions workflow builds the APK on a `mobile-v*` tag (to add).

## API reference (already live)
- `GET  /api/v1/auth/users?org_slug=<slug>` → `[UserOut]`
- `POST /api/v1/auth/login` `{org_slug, user_id, pin}` → `{access_token, refresh_token, user}`
- `POST /api/v1/auth/refresh` `{refresh_token}` → new tokens
- `GET  /api/v1/dashboard/` → `{today_revenue, today_transactions, payment_breakdown, low_stock_count, top_products[]}`
- `GET  /api/v1/products/`, `POST /api/v1/products/`, etc.

## Build sequence
1. ✅ Scaffold: Dio auth client + slug/PIN login + dashboard (this commit)
2. Products + sales lists (companion MVP) → ship APK
3. Reports + inventory + customers → companion complete
4. Offline DB + sync engine
5. Sell screen + payments
6. Bluetooth thermal printing + barcode scan → full POS
