# Supabase activation runbook — Royalty backend

Target database: **hosted Supabase, PostgreSQL 17.6** (the real target; the earlier
Podman/local Postgres 16 plan is dropped). Written from commands actually run in
this workspace; kept current as database phases complete.

## Connection

- Migrations and `db:*` commands run over `DATABASE_URL` from `backend/.env`:
  the **Supabase session pooler on port 5432** (allowed type for migrations).
  The transaction pooler on port 6543 is **not** suitable for migrations.
- `DIRECT_URL` (the `db.*` direct host) is configured as the alternative.
- `backend/.env` is gitignored (`backend/.gitignore:9`). Never print connection
  strings or passwords.
- TLS: prefer the Supabase CA certificate for any direct `pg` access —
  `ssl: { ca: fs.readFileSync('backend/certs/supabase-ca.crt'), rejectUnauthorized: true }`.
  Do not disable certificate verification for steps that send credentials.

### CA certificate (verified in STEP 2)

- File: `backend/certs/supabase-ca.crt` (copy of `backend/prod-ca-2021.crt`,
  Supabase's standard dashboard download name). PEM, one certificate, **no
  private key block**; gitignored (`backend/.gitignore:37`), not in `git status`.
- Subject: `C=US, ST=Delware, L=New Castle, O=Supabase Inc, CN=Supabase Root 2021 CA`
- Issuer: `C=US, ST=Delware, L=New Castle, O=Supabase Inc, CN=Supabase Root 2021 CA` (self-signed root)
- Valid: **2021-04-28 → 2031-04-26** (not expired)
- TLS result (STEP 2): connected with `ssl: { ca, rejectUnauthorized: true }`
  over the session pooler — **verification passed**. Earlier ad-hoc probes that
  skipped verification were pre-STEP-2 diagnostics only and are not part of the
  procedure.

## Apply order (what was run)

1. Gate 0 pre-flight (read-only): connection type, `select version()` (17.6),
   `rolname, rolbypassrls` for `current_user` (`postgres`, `rolbypassrls = true`),
   FORCE RLS check (0 tables), `npm run db:verify`, row counts, backup check.
2. Edit `src/prisma/contract.prisma` (review_ratings + enum + check + unique +
   FK cascade + three FK indexes), then `npm run contract:emit`.
3. Generate the migration **from contract changes, never hand-written SQL**:
   `npx prisma migration plan --name review_ratings`
   → package `migrations/app/20261024T1132_review_ratings`
   (`from 0c3dbaac…` = the current marker at plan time, `to c0b37f8f…`,
   8 operations, **all classified `additive`**).
4. Apply: `npm run db:migrate` → "Applied 1 migration(s) (8 operation(s))".
5. Verify: `npm run db:verify` → "Database marker and schema match contract"
   (storage hash `c0b37f8f…`).

## Application layer (STEP 3)

- `POST /reviews` body: `{ appointmentId, ratings: { service, products, staff,
  timeManagement }, comment? }` — strict Zod objects (unknown keys rejected),
  each rating an integer 1–5, comment max 2000. Keys map to the
  `review_rating_category` enum (SERVICE / PRODUCTS / STAFF / TIME_MANAGEMENT).
- One `db.transaction` creates the review row and its four `review_ratings`
  rows; a unique violation (23505/P2002) maps to 409 **outside** the failed
  transaction (race-safe).
- `reviews.rating` is required (non-null), so it stores the **deprecated**
  legacy overall: `Math.round` of the four-rating average (compat only, G-07).
- Reads compute `overallRating` = 1-dp average when four category rows exist;
  grandfathered reviews fall back to `reviews.rating` with `ratings: null`.
  Applies to `GET /reviews` and `GET /appointments/mine` (which also returns
  `review: { overallRating, ratings, comment }` per reviewed appointment).
- Hosted check (verified TLS, one connection, `BEGIN … ROLLBACK`): the service's
  insert sequence created a review + 4 rating rows; read-back computed
  **overall 4.5** (expected 4.5, PASS) with legacy column 5 (PASS); after
  `ROLLBACK` the row counts matched the baseline exactly
  (accounts 3, customers 1, appointments 4, reviews 0, review_ratings 0,
  staff 1, payments 0).

## Post-apply checklist

- [x] `npm run db:verify` — green (see above).
- [x] Constraint SQL tests (STEP 2) — all 8 cases verified on the hosted DB
      inside one `BEGIN … ROLLBACK` on a single connection
      (`pg_backend_pid()` 11854 before and after), each case in its own
      `SAVEPOINT`/`ROLLBACK TO SAVEPOINT`:
      duplicate review → `23505 reviews_appointment_id_key`; `reviews.rating`
      0/6 → `23514 valid_rating`; `review_ratings.rating` 0/6 →
      `23514 valid_review_rating`; duplicate (review_id, category) →
      `23505 review_ratings_review_category_key`; category `AMBIANCE` →
      `22P02 invalid input value for enum review_rating_category`; nonexistent
      review_id → `23503 fk_review_rating_review`; delete review → its 4 rating
      rows deleted (before 4 / after 0); positive control inserted 1 review + 4
      ratings. Row counts after ROLLBACK identical to Gate 0.
- [ ] RLS dashboard checks (Supabase → Authentication → Policies): the 17 app
      tables have RLS enabled with **no policies**; backend access works because
      the connection role is the table owner with `rolbypassrls = true`.
      Decide the anon/authenticated policy posture before exposing any
      client-side database access (tracker G-13 / section E).
- [x] Seed step: `npm run db:seed` — **run twice against the hosted DB**
      (STEP 4). Run 1 = one-time upgrade: MANAGER account added,
      `APT-SEED-0003` extended to 2 services (totals kept consistent:
      09:00–11:15, ₱1,550.00), `APT-SEED-0005` created (COMPLETED, 2 services,
      ₱1,550.00), and all seed account passwords rotated to `crypto.randomBytes`
      values (bcrypt cost 12) written once to gitignored
      `backend/.seed-credentials.local`. Run 2 = "already present. Nothing to
      do." with identical counts and identical password-hash digests (no
      re-rotation). **All seed rows are TEST DATA** — remove with
      `SEED_REMOVE_CONFIRM=royalty-seed-delete npm run db:seed:remove` or rotate
      the passwords before real customers use this database.
- [x] `db:seed:remove` FK-safe order proven (STEP 4): reviews (+ cascaded
      `review_ratings`) are deleted **before** the appointments
      (`reviews.appointment_id` is ON DELETE RESTRICT). Proof ran on the hosted
      DB inside `BEGIN … ROLLBACK` on one connection (verified TLS): a proof
      review + 4 rating rows inserted, the full removal sequence completed
      without FK errors, and all counts returned to the post-seed values after
      ROLLBACK.
- [x] Frontend connection (STEP 5): `CORS_ORIGINS` allowlist (no wildcard;
      credentials off) and `frontend/user` `VITE_API_URL` (see
      `frontend/user/.env.example`). Set `CORS_ORIGINS` to the deployed
      frontend origin when it is supplied — it is intentionally not hardcoded.
- [x] STEP 6 verification run (all against the hosted DB): 4 role logins +
      `/appointments/mine` smoke; one real UI review on APT-SEED-0003
      (transaction path; SQL: 1 review + 4 rating rows, legacy 5 vs computed
      4.5; stale-form 409 `CONFLICT` body captured); test reviews deleted by
      exact ID (cascade 8→4→0); `reviews.integration.test.ts` run green
      16/16 with its scoped cleanup returning every count to 0; a throwaway
      `POST /appointments` booking cancelled through the UI (SQL `CANCELLED`)
      and deleted by exact ID. **Final counts: accounts 4, customers 1,
      appointments 5, appointment_services 9, reviews 0, review_ratings 0,
      staff 1, payments 0.** FE-01 vitest suite 12/12; browser checks (roles
      no-access, expiry clearing, network-failure retention, 375/1280 widths,
      console clean); CORS curl preflight allowed/absent as designed.
- [ ] Smoke test one request per route (STEP 6).
- [ ] **G-09 grandfather count**: `select count(*) from reviews` at activation
      (was **0** at Gate 0). Reviews without `review_ratings` rows are
      grandfathered: they keep no category rows, are excluded from category
      averages, and display overall-only from the deprecated `reviews.rating`.
- [ ] Backups: no `pg_dump` exists in this workspace — confirm the Supabase
      project's own backup/PITR configuration in the dashboard before real
      customer data lands.

## Known risks

- Migration-history bookkeeping gap (tracker G-25): the applied baseline is an
  unnamed 5-op record (2026-09-18), not the on-disk `20261005T1356_baseline`
  package. Fresh environments must bootstrap with `prisma db init` or verify
  with `prisma db verify` immediately after replaying migrations.
