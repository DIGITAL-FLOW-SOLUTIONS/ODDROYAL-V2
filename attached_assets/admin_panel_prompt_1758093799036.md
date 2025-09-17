**Build a Production-Grade Admin Panel `/prime-admin` for PRIMESTAKE**

Implement a secure, production-ready **Admin Panel** for PRIMESTAKE available at **`/prime-admin`**. Use the existing project and integrate with current frontend, backend, DB and bet engine. This admin panel must match enterprise sportsbook standards and include UI, API endpoints, back-end processes, logging, and monitoring. Build to production quality — not MVP. Follow these instructions exactly.

---

## 1) High-level requirements
- Path: **/prime-admin** (admin area separated from public frontend).
- Authentication/Access: strict **role-based access control (RBAC)** with built-in **2FA** for all admin users; admin sessions stored server-side, with refresh/rotation and secure cookies.
- Security: HTTPS enforcement, input validation, CSRF protection, Content-Security-Policy, rate limiting, helmet headers, audit logs (immutable), logging to file + external logging system.
- Encryption: all secrets in `.env`, use AES-256 for any sensitive persisted fields; password hashing using `bcrypt`/`argon2`.
- Admin roles: `superadmin`, `admin`, `risk_manager`, `finance`, `compliance`, `support`. Enforce per-route permissions.
- Auditability: Every admin action must be logged (who, what, when, before/after state, IP).
- Integrations: sport data (SportMonks) kept for normal ops; admin can **create & edit** matches/markets locally for internal events.

---

## 2) Tech stack & infra guidelines
- Frontend: Next.js (React) admin app under `/prime-admin` routes or separate `admin` Next.js app; use Tailwind CSS (continuity with main UI), React Query for data fetching, Framer Motion for animations.
- Backend: Node.js (Express or NestJS) with API namespace `/api/admin/*`.
- DB: SUPABASE PostgreSQL (production).  Use Prisma or Knex for migrations/ORM.
- Cache: Redis for sessions, rate limiting, and caching exposures/odds.
- Background jobs: BullMQ (Redis) or Node Cron for settlement worker, retries.
- Logging: Winston or Pino, push to external (e.g., LogDNA) in config.
- Monitoring: Sentry for errors; Prometheus + Grafana for metrics.
- CI/CD: GitHub Actions template for tests, lint, build, deploy.

---

## 3) Routing & pages to implement (admin UI)
Implement these pages under `/prime-admin` with nested navigation and breadcrumbs:

1. **Dashboard (overview)**  
   - Widgets: Real-time open bets count, daily turnover, GGR, live exposure heatmap (top markets), system alerts, recent admin actions.
   - Live stream: recent bets & highest liability events.

2. **Matches & Markets (Catalog)**  
   - List + Search + Filters (date, league, manual vs. feed).  
   - Actions: Create match, Edit match, Delete (soft-delete), Import from SportMonks, Sync with SportMonks.  
   - For each match: open Markets management UI (see Market Editor below).

3. **Market Editor (per match)**  
   - Create / Edit market categories (1X2, Totals, Handicap, Correct Score, Asian lines, Custom props).  
   - For each market outcome: set odd (decimal), status (open/closed/suspended/void), limit min/max stake, max liability per user & per market.  
   - Bulk upload odds CSV and a UI to edit odds inline (spreadsheet-like).  
   - “Publish” / “Unpublish” toggle to push to live.

4. **Risk / Exposure**  
   - Real-time exposure calculator: for selected match/market compute total liability (sum of potential payouts for open bets).  
   - Filter by market, bookmaker (if used), or user segment.  
   - Show exposure per selection (how much the book would lose if that outcome wins).  
   - Allow temporary market limits or suspension if exposure > threshold.

5. **Bet Management**  
   - View and filter bets (open/pending/settled/refunded).  
   - Drill-down: bet details, selections, stake, odds at placement, current status.  
   - Actions: Force-settle (win/lose/void), manual payout, refund, reverse bet. Must require confirm + audit reason + 2FA for force actions.

6. **Settlement Control & Reconciliation**  
   - Manual and automated settlement options.  
   - Show reconciliation view: unsettled bets vs. external results, mismatches, and ability to reprocess.  
   - Export settlement reports (CSV/PDF).


7. **User Management**  
   - Full user list, search, filter, profile view.  
   - Actions: Freeze account, Ban/unban, Adjust wallet balance (credit/debit with reason), View transaction history, Impose custom limits. 

8. **Promotions & Bonus Engine**  
   - Create / Edit promotions: free bet, deposit match, cashback, accumulator boosts.  
   - Scheduling: start/end dates, per-user segmentation, promo code creation.  
   - Apply promotion to user or groups.  
   - Track promo redemptions and ROI.

9. **Financials & Reporting**  
    - Reports: Turnover, Stakes, Payouts, Gross Gaming Revenue (GGR), Net Revenue, Commission, Taxable Revenue — filterable by date range & product.  
    - Daily/weekly/monthly exports.  
    - Ledger & audit trail for every monetary transaction.  
    - CSV/Excel export and scheduled email reports.

10. **Audit Logs & Admin Activity**  
    - Immutable audit log for: odds changes, bet settlements, manual payouts, user blocks, admin logins.  
    - Searchable by admin user, action type, date.  
    - Each log row includes before/after snapshot.

11. **Settings & Config**  
    - Risk thresholds, global min/max stake, currency config, timezone.  
    - Integration keys (SportMonks, payment providers), with masked display and rotation instructions.  
    - IP allowlist for admin UI and optional 2FA enforcement toggles.

12. **Security & Access**  
    - Admin user management, role assignment.  
    - 2FA setup (TOTP) during admin account creation.  
    - IP whitelist option per role.  
    - Session management: invalidate sessions, view active sessions.

---

## 4) Backend APIs to implement
Create `/api/admin/*` endpoints (authenticated + RBAC). Examples:

- `POST /api/admin/login` — admin login with 2FA challenge
- `GET /api/admin/dashboard` — aggregated stats
- `GET /api/admin/matches` — list matches (filterable)
- `POST /api/admin/matches` — create match (manual)
- `PUT /api/admin/matches/:id` — update match
- `DELETE /api/admin/matches/:id` — soft delete
- `POST /api/admin/matches/:id/markets` — create market
- `PUT /api/admin/markets/:id` — edit market and outcomes
- `POST /api/admin/markets/:id/odds/bulk` — bulk upload
- `GET /api/admin/exposure?match_id=&market_id=` — compute exposure (see exposure calc below)
- `GET /api/admin/bets` — list/filter bets
- `POST /api/admin/bets/:id/settle` — force settle (requires audit note & 2FA)
- `POST /api/admin/users/:id/block` — block user
- `POST /api/admin/users/:id/wallet/adjust` — credit/debit
- `GET /api/admin/reports/ggr?from=&to=` — financial reports
- `GET /api/admin/audit` — audit logs

All admin endpoints must:
- Validate input server-side.
- Check RBAC perms.
- Emit an audit log entry for critical state-changing operations.

---

## 5) Database schema (recommended) — create migrations
Provide these tables (illustrative columns). Implement with migrations.


**admin_users**  
- id (uuid), username, password_hash, role, totp_secret (encrypted), last_login, created_at

**matches**  
- id (uuid), external_id (nullable), league_id, home_team_id, away_team_id, kickoff_time (UTC), status (scheduled / live / finished / cancelled), manual_override (bool), created_by_admin, created_at, updated_at

**markets**  
- id, match_id, key (e.g., `1x2`, `totals:2.5`), name, type, status (open/closed/suspended), min_stake, max_stake, created_at

**market_outcomes**  
- id, market_id, label (e.g., `Home`, `Draw`, `Away`, `Over 2.5`), odds (decimal), odds_source (manual/auto), status, liability_limit

**bets**  
- id, user_id, type (single/express/system), stake, total_odds, potential_payout, status (pending/won/lost/void/cancelled), placed_at, settled_at, placed_by (user), accepted_by_admin (nullable)

**bet_selections**  
- id, bet_id, match_id, market_id, outcome_id, odds_at_placement, result (win/lose/void), settled_amount

**transactions**  
- id, user_id, type (deposit, withdrawal, stake, payout, manual_adjustment), amount, balance_before, balance_after, created_at, reference_id

**exposure_snapshots**  
- id, match_id, market_id, outcome_id, exposure_amount, snapshot_time

**audit_logs**  
- id, admin_id, action_type, target_type, target_id, data_before (json), data_after (json), note, ip, created_at

**promotions**  
- id, name, type, params(json), start_at, end_at, created_by, status

**odds_history**  
- id, outcome_id, odds, timestamp, source (sportmonks/manual)

Provide indexes (match_id, market_id, created_at) and foreign keys. Use transaction-safe DB ops for wallet updates and bet placement.

---

## 6) Exposure / Liability calculation (algorithm)
- For each open bet selection: `liability = stake * (odds - 1)` (or for accumulator compute proportional).
- Exposure for an outcome = sum of liabilities for bets that would lose the book if that outcome wins.
- Implement SQL / Redis script to compute:
  ```
  SELECT SUM(
    CASE WHEN bet_type='single' THEN stake*(odds_at_placement-1)
         WHEN bet_type='express' THEN (stake * (odds_product_of_all_selections) - stake) * contributor_share
    END
  ) as exposure
  FROM bet_selections JOIN bets ...
  WHERE outcome_id = :outcome_id AND bets.status = 'pending'
  ```
- Provide a cached exposure snapshot every minute.

---

## 7) Admin match creation & odds management UX
- Market Editor UI: left column list of markets (drag/drop ordering), right column outcome grid editable inline.
- Inline edit: click the odd cell to edit decimals, show validation (min 1.01).
- Audit reason modal when changing odds +/- > threshold.
- Preview button: show how frontend consumers will see the markets prior to publish.
- “Lock market” button to prevent further bets when risk limits reached.

---

## 8) Settlement features & reconciliation
- Auto-settlement: settlement worker uses SportMonks results to auto settle bets.
- Manual override: admin may force settle when external feed is wrong.
- Reconciliation view: identify missing results, duplicates, or errors. Provide auto-retry and manual re-fetch.

---

## 9) Security, auditing & operational controls
- Admin login: TOTP 2FA enforced for any admin role except maybe `support` (but still 2FA recommended).
- Rate-limit admin endpoints.
- IP allow list for `superadmin` actions.
- Use secure cookies `HttpOnly`, `SameSite=Strict`, TLS everywhere.
- All state-changing actions require CSRF token + re-confirmation for destructive actions.
- Immutable audit log (append-only).
- Provide an emergency “panic button” to pause all betting.

---

## 10) Reporting & exports
- Pre-built reports: Daily GGR, Turnover by sport/league, Bets count, Payout ratio, Top winners, Chargebacks.
- Scheduleable exports to CSV and PDF via cron.
- Admin can generate on-demand ad-hoc reports by arbitrary filters.

---

## 11) Notifications & alerts for admins
- Email & in-dashboard alerts for: exposure threshold breach, failed settlement jobs, suspicious activity, high value bets.
- Slack / Webhook integration hook for critical alerts.

---

## 12) Testing, QA, and deployment
- Unit tests for exposure engine, bet acceptance logic, wallet transactions.
- Integration tests for critical flows: place bet → accept → settle → payout.
- Load testing script to simulate heavy betting on a single match (to test exposure and DB).
- Prepare deployment scripts for a containerized environment (Dockerfile, docker-compose, manifest for Kubernetes).

---

## 13) Deliverables & acceptance criteria
- Fully functional admin UI at `/prime-admin` protected by secure admin auth and roles.
- All backend endpoints implemented with validations and audit logs.
- DB migrations and seed scripts (including a sample admin user and sample match data).
- CI scripts to run tests, linting.
- README with admin setup steps, secrets required, and how to perform critical admin operations (create admin, force-settle, backup/restore DB).
- A demo login (temporary) and documentation of how to switch to production secrets (SportMonks key, payment keys, S3).

---

## 14) Implementation notes for Replit
- Use the existing project database and extend it; if Replit environment lacks Postgres, scaffold migrations and use SQLite for dev but ensure code supports switching to Postgres.
- Place admin UI under `pages/prime-admin/*` or an `admin` folder; ensure server uses `process.env.ADMIN_BASE_PATH` variable.
- Mask API keys in environment UI and do not expose to frontend.
- Create a script `scripts/create_admin_user.js` to seed a secure superadmin account and print setup instructions.

---


