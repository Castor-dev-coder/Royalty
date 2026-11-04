# Backend Issues and Follow-up Work

**Report date:** 21 October 2026
**Scope:** Records outstanding backend work, verification still owed, and decisions that need a business answer. It does **not** claim the backend was fixed.

The live database is currently paused. The changes described in section B were written and unit-tested while the database was unreachable, and they have **not** been exercised against a running database. Nothing in this document has been applied to a live system.

---

## A. Database connectivity and live verification

### Finding

An in-repository database probe fails with the exact error:

```
Database error while reading contract marker
```

That message is a masking error from the Prisma 8 CLI, not the root cause.
Probing the connection directly shows what is actually wrong:

| Probe | Result |
|---|---|
| TCP connect to `aws-0-ap-southeast-2.pooler.supabase.com:5432` | Succeeds — the network is up |
| Raw `pg` via `DATABASE_URL` | `XX000: (ENOTFOUND) tenant/user postgres.slqgduzghtkrunjyxyep not found` |
| Raw `pg` via `DIRECT_URL` (`db.slqgduzghtkrunjyxyep.supabase.co`) | `ENOTFOUND: getaddrinfo ... no such host` |
| Raw `pg` via discrete `DB_HOST` / `DB_USER` | `XX000: (ENOTFOUND) tenant/user postgres.slqgduzghtkrunjyxyep not found` |

**Root cause: the Supabase project `slqgduzghtkrunjyxyep` no longer exists.** The
pooler host still resolves and accepts a TCP connection, but the tenant is
unknown to it, and the direct project's DNS name does not resolve at all. The
credentials in `.env` are stale — the project was deleted, paused indefinitely,
or renamed.

The database is therefore unreachable, so no live integration assertion of any
kind has been performed.

### Affected files

- `backend/src/prisma/db.ts` — the connection used by every service
- `backend/src/prisma/contract.d.ts` — the contract-marker read that fails first
- `backend/scripts/seed.ts` — the seed entry point, unusable without a database

### Impact

**Blocks live verification only.** The frontend work is complete against the API contracts and the browser mock adapter, and the backend compiles and passes its unit suite. It does not block the frontend.

### Required action after the database is reactivated

1. Confirm the connection string resolves and the contract marker reads:
   `node --import tsx backend/scripts/seed.ts --check` (or the equivalent probe used when the failure was first found).
2. Run the backend suite against the live database, not only the mocked ORM:
   `cd backend && npm test`.
3. Run the seed and confirm it completes:
   `cd backend && npm run seed`.
4. Start the server and exercise each route in section B with a real token — the exact steps are listed there.
5. Re-run the frontend against `VITE_API_URL` pointing at the live server, so the mock adapter is out of the path.

### Status

**Confirmed** (the failure is reproducible and the exact message is recorded). Everything downstream is **awaiting live verification**.

---

## B. Backend behaviour changed in this cycle and still needs live verification

The following backend source was changed in this cycle. Each change is listed with the evidence that supports it and the checks that remain.

### B.1 — Staff self-service service assignments

**Change.** A new self-scoped endpoint was added:

```
GET /services/staff/me/services
```

- `backend/src/modules/services/service.service.ts` — `getServicesForOwnStaff(accountId)` resolves the staff row through `Staff.accountId` and delegates to a shared assignment-list helper.
- `backend/src/modules/services/service.controller.ts` — `getOwnServicesForStaffController` uses the authenticated request's account ID.
- `backend/src/routes/services.ts` — the route is registered **before** `GET /staff/:id/services` so `me` is never captured as a staff row ID.

**Why.** There was no way for a staff member to read their own service assignments. The only existing route, `GET /staff/:id/services`, is restricted to `ADMIN` and `MANAGER`, and exposing it to staff would have leaked other staff members' assignments.

**Evidence.** Unit tested in `backend/src/modules/services/service.service.test.ts` (account-to-staff resolution, missing profile, own assignments, management assignments). Route ordering is asserted in `backend/src/routes/routes.order.test.ts`. The backend suite passes 43/43.

**Live checks still required.**

1. Sign in as a staff account; call `GET /services/staff/me/services` and confirm it returns only that member's assignments.
2. Call `GET /services/staff/me/services` with an account that has no staff profile and confirm the `NotFoundError` path.
3. Confirm `GET /staff/me/services` is not captured by `GET /staff/:id/services` (the route-order test covers registration, not runtime dispatch).
4. Confirm a staff token receives `403` from `GET /staff/:id/services` for another member's ID.
5. Confirm the response shape matches what the frontend client expects.

### B.2 — `PATCH /staff/:id` validation

**Change.** `backend/src/routes/staff.ts` now validates the request with `updateStaffDetailsSchema` instead of `updateStaffEmploymentSchema`.

**Why.** The controller and the service both write `firstName`, `lastName` and `phone`, but the employment-only schema did not include them. The validator strips unknown keys, so those three fields were silently discarded and the request appeared to succeed while changing nothing.

**Evidence.** Verified by reading the validator's `safeParse` behaviour and the controller and service write paths. **Not** yet covered by a test.

**Live checks still required.**

1. `PATCH /staff/:id` as `ADMIN` with `firstName`, `lastName`, `phone`, `primaryRole`, `employmentType` and `workStatus`; confirm every field is persisted.
2. Confirm a request with an invalid value for any field is rejected with a validation error rather than partially applied.
3. Confirm `PATCH /staff/me` is still unaffected and still permits the phone-only change.
4. Confirm `STAFF` still receives `403` on `PATCH /staff/:id`.

**Recommended.** Add a test that asserts each field round-trips, so the schema and the service cannot drift apart again.

### B.3 — Client identity on a staff member's own appointments

**Change.** `backend/src/modules/appointments/appointments.service.ts` adds `StaffAppointmentInfo` and enriches `listForStaff` with a limited customer object: `id`, `firstName`, `lastName` and nullable `phone`.

**Why.** A staff member's own appointment carried only a customer ID, so the staff dashboard could not show who was booked. This mirrors the existing `CompletedAppointmentInfo`, which enriches the customer's completed list with the staff identity.

**Evidence.** The code path was read and the shape was matched to the existing precedent. The list is still filtered to the signed-in member by `Staff.accountId`. **Not** yet covered by a test.

**Live checks still required.**

1. Sign in as staff and confirm the list contains only that member's appointments, each with the correct client name.
2. Confirm a `CANCELLED` or `NO_SHOW` appointment for that member still resolves its client.
3. Confirm the response does not expose any customer field beyond the four listed.
4. Confirm `STAFF` still receives `403` from `GET /appointments` (the all-appointments route).

**Recommended.** Add a test asserting both the filtering and the customer shape.

### Status for section B

All three are **awaiting live verification**. The unit suite covers B.1; B.2 and B.3 have no test coverage yet.

---

## B4. The payments screen is mock-only — there is no payments router

### Finding

`backend/src/modules/payments/` is an **empty directory**, and there is no
`backend/src/routes/payments.ts`. `backend/src/server.ts` mounts exactly eight
routers — `/auth`, `/accounts`, `/customers`, `/staff`, `/services`,
`/schedules`, `/appointments`, `/reviews` — and `/payments` is not among them.

The `Payment` **model** exists in the contract (`contract.prisma`, table
`payments`), but there is no HTTP layer behind it.

### Impact

Every payment figure the admin frontend shows — the revenue card, the payment
summary, the payment-status breakdown chart, the payment verification queue —
is served by the browser-local mock adapter. Against a live backend these
figures have no source.

The frontend already handles this honestly: the dashboard shows `—` and
`NOT CONNECTED` when the payments request fails, and the payments page states
that the configured backend does not expose payment records. **No live payment
metric can be claimed**, and the payment-status breakdown chart must be
described as mock-derived in any report.

### Required backend work

A payments router and handlers, mounted under `/payments`, exposing the list,
verification and status-update operations the frontend already calls. No
migration is implied: the model and the table already exist.

---

## C. Account credential provisioning

### Finding

**Staff-profile creation and user-account creation are separate operations, and only one of them exists on the backend.**

| Operation | Backend support |
| --- | --- |
| Create a staff **profile** | `POST /staff` — exists. Requires an existing account with the `STAFF` role; creates only the profile. |
| Create a staff **login account** | **Does not exist.** There is no `POST /accounts` route. |
| Set a new password on an existing account | `POST /accounts/:id/password` — exists. `ADMIN`/`MANAGER` only. Does not require the account's current password. |
| Read an account's current password | **Impossible.** Only a bcrypt hash is stored. |

**Evidence.** `backend/src/routes/accounts.ts` registers `GET /accounts`, `GET /accounts/:id`, `PATCH /accounts/me`, `POST /accounts/me/password`, `PATCH /accounts/:id/status` and `POST /accounts/:id/password`. There is no account-creation route. `backend/src/modules/accounts/accounts.service.ts` stores `passwordHash` via `bcrypt.hash` and never stores or returns the plaintext.

### Why an existing password cannot be displayed

The plaintext is not recoverable. `bcrypt` is a one-way hash: the salt is embedded in the stored value and the original cannot be reconstructed. There is no endpoint, and no correct way to add one, that returns an existing account's password. The only supported flow is to **set a new password** using `POST /accounts/:id/password`, which is what the administrator UI now does.

### Impact

- The frontend credential handover works today for an **existing** staff account, using `POST /accounts/:id/password`.
- Creating a brand-new staff **login** from the administrator UI is **not** possible against the live backend, and the interface says so rather than pretending otherwise. In live mode the account-creation dialog reports that the configured backend has no administrator account-creation endpoint.
- No plaintext password is stored in `localStorage`, `sessionStorage`, the application log, or any persistent frontend state. The credential panel holds the value in component state for the lifetime of the dialog only.

### Required backend work — create a staff login account

If the administrator interface must create staff logins, the backend needs a new endpoint. The contract that would satisfy it:

```
POST /accounts
Authorization: Bearer <admin or manager token>
Content-Type: application/json

{
  "firstName": "Camille",
  "lastName": "Dizon",
  "email": "camille.dizon@example.com",
  "role": "STAFF",
  "password": "<initial password>",
  "requiresPasswordChange": true
}
```

Response `201`:

```json
{
  "data": {
    "id": "<account uuid>",
    "email": "camille.dizon@example.com",
    "role": "STAFF",
    "status": "ACTIVE",
    "createdAt": "<timestamp>"
  }
}
```

Requirements on that endpoint:

1. Role-restricted to `ADMIN` and `MANAGER`, and the created role must not be `ADMIN` unless the requester is an `ADMIN`.
2. The email must be unique; return `409` on a duplicate.
3. The password must be hashed with `bcrypt` (cost 12, as `changePassword` already does) before storage, and the hash must never appear in the response.
4. `requiresPasswordChange` should be set so the staff member is prompted to choose their own password.
5. A staff-role account should create the linked staff profile in the same transaction, or the frontend must call `POST /staff` afterwards as it already does.
6. The response should not echo the password. The administrator already knows it, because they supplied it.

The response schema in `backend/src/modules/accounts/accounts.schemas.ts` already excludes `passwordHash`, so the existing `accountResponseSchema` is the right shape to reuse.

### A note on one-time credential delivery

The current design has the administrator choose or generate the initial password and hand it over directly. If a one-time link is wanted instead — a token that lets the staff member set their own password once — that needs a different contract, and it needs somewhere to store the token and its expiry. No such mechanism exists today.

**Status:** **Awaiting a business decision** on whether account creation belongs in the backend at all, and **awaiting live verification** that `POST /accounts/:id/password` behaves as described against a real database.

---

## D. Role and mock-mode inconsistencies

### Finding

The backend grants `MANAGER` the same management rights as `ADMIN` for accounts, staff, services and schedules. The browser mock adapter used for local development only accepts `ADMIN` and `STAFF` at sign-in:

```ts
if (!account || !['ADMIN', 'STAFF'].includes(account.role) || account.status !== 'ACTIVE' || ...) {
  return errorResponse('Invalid development demo credentials.', 401);
}
```

A `MANAGER` account therefore cannot sign in to the mock, even though the live backend would let it manage accounts, staff and services.

### Affected files

- `frontend/admin/src/api.ts` — the mock sign-in role list and the mock account fixtures
- `backend/src/middleware/auth.ts` — the authoritative `requireRole` list
- `backend/src/routes/accounts.ts`, `backend/src/routes/staff.ts`, `backend/src/routes/services.ts`, `backend/src/routes/schedules.ts` — the role guards

### Impact

**Does not block the frontend.** It makes the mock less faithful to the backend than it needs to be, so a `MANAGER` path can be exercised locally only against the live server. The live authorization model is not weakened by this.

### How it should be reconciled

1. Extend the mock sign-in to accept `MANAGER`, matching the backend's `requireRole` list.
2. Give the mock a `MANAGER` fixture account with the same management rights the backend gives that role.
3. Derive the mock's accepted roles from a single list, rather than repeating them inline, so the mock and `requireRole` cannot drift.
4. Test that a `MANAGER` token receives `403` on the routes that are `ADMIN`-only, and `200` on the ones that are `ADMIN`/`MANAGER`.

**The authorization model must not be loosened to make the mock pass.** The fix is in the mock's accepted sign-in roles, not in the backend's role guards.

### Status

**Confirmed** (read directly from the mock and the route guards). The reconciliation is **awaiting a decision** on whether the mock should model `MANAGER` at all.

---

## E. Reviews access — policy decision

### Finding

`GET /reviews` is registered without `authenticate`:

```ts
reviewsRouter.get('/', listReviewsController);
```

It is therefore publicly readable. A request with no token receives the published reviews.

### Why it was not changed

`backend/src/test/integration/reviews.integration.test.ts` explicitly asserts that an unauthenticated request succeeds. The public contract is intentional and pinned by a passing test. Changing it would have broken that test, and changing an access rule on a guess is not acceptable.

### Impact

**Does not block the frontend.** The staff dashboard does not read the reviews endpoint. The administrator dashboard does read it, and displays published review content, which is the same content the public site shows.

### Decision required

This is a policy question, not a defect:

1. Is a publicly readable reviews list intended? If so, the missing `authenticate` is deliberate and the route deserves a comment saying so, so the next reader does not "fix" it.
2. If reviews are meant to be internal, the route needs `authenticate` and the integration test needs to be updated to expect `401` without a token.

**Status:** **Awaiting a business decision.** Not to be changed until the policy is confirmed.

---

## F. Staff appointment cancellation — policy unresolved

### Finding

The appointment status transition table in `backend/src/modules/appointments/appointments.rules.ts` permits `RESERVED → CANCELLED` and `CONFIRMED → CANCELLED`. A staff member cancelling their own booking is therefore a permitted backend state transition.

The staff dashboard does **not** offer it. The staff appointment panel exposes:

- `RESERVED → CONFIRMED` — "Confirm booking"
- `CONFIRMED → COMPLETED` — "Mark completed", offered only once the appointment's end time has passed
- `CONFIRMED → NO_SHOW` — "Mark no-show", offered only once the appointment's end time has passed

Cancellation is left to the administrator and to the customer.

### Impact

**Does not block the frontend.** The narrower staff action set is safe and self-consistent. Nothing is broken by the absence of a staff cancel button.

### Decision required

1. Should a staff member be able to cancel a booking that is assigned to them? If yes, which transitions — `RESERVED` only, or `CONFIRMED` as well?
2. Should a staff cancellation require a reason, and should it notify the customer?
3. Should a staff cancellation be distinguishable from an administrator cancellation in the audit log and in the customer-facing history?

The transition table already permits it, so no backend change is needed for the first question — only a decision.

**Status:** **Awaiting a business decision.**

---

## Summary

| # | Item | Status |
| --- | --- | --- |
| A | Database connectivity and live verification | **Confirmed** failure; all live checks **awaiting** the database |
| B.1 | `GET /services/staff/me/services` | **Awaiting live verification** |
| B.2 | `PATCH /staff/:id` validation schema | **Awaiting live verification**; no test yet |
| B.3 | Customer identity on own appointments | **Awaiting live verification**; no test yet |
| C | Staff login account creation | **Confirmed** missing; **awaiting a decision** on whether to build it |
| D | `MANAGER` cannot sign in to the mock | **Confirmed**; **awaiting a decision** on the reconciliation |
| E | `GET /reviews` is publicly readable | **Awaiting a policy decision** — deliberately unchanged |
| F | Staff cancellation of own appointments | **Awaiting a business decision** |

No backend source file, authentication rule, API contract, database schema, migration, seed script, environment file or database content was changed while preparing this report.

---

## G. Database-layer completion task — tracker (2026-10-24)

Task tracker for "complete the backend database layer so it is ready for live testing on Supabase". **Type** ∈ table, column, key, unique, index, check, RLS policy, seed row, code, doc. **Status** ∈ needed, changed, done. **Evidence** is the command or test output that proves the status. Phases 2–3 (schema changes, Docker verification) are **blocked pending approval of this Phase 1 list**.

### G.0 Tracked items

| ID | Item | Type | Status | Evidence |
| --- | --- | --- | --- | --- |
| G-01 | `review_ratings` table (id, review_id, category, rating) | table | done | Migration `20261024T1132_review_ratings` applied via `npm run db:migrate` ("Applied 1 migration(s) (8 operation(s))"); `npm run db:verify` → "Database marker and schema match contract" at `c0b37f8f…` |
| G-02 | `review_rating_category` enum (SERVICE, PRODUCTS, STAFF, TIME_MANAGEMENT) | column | done | Same migration, op `createNativeEnumType.review_rating_category` (additive) |
| G-03 | `review_ratings.rating` smallint with check 1–5 (`valid_review_rating`) | check | done | Same migration; CHECK embedded in `CREATE TABLE "review_ratings"` |
| G-04 | Unique `(review_id, category)` on `review_ratings` | unique | done | Same migration, constraint `review_ratings_review_category_key` (additive) |
| G-05 | FK `review_ratings.review_id → reviews.id ON DELETE CASCADE` | key | done | Same migration, `fk_review_rating_review … ON DELETE CASCADE` (additive) |
| G-06 | All-four-categories-per-review enforced in service layer + one transaction creating review + 4 rating rows | code | done | `ReviewsService.create` wraps the review + 4 `review_ratings` inserts in one `db.transaction`; strict Zod body `{ appointmentId, ratings: { service, products, staff, timeManagement }, comment? }`; 101/101 unit+route tests pass (incl. injected 3rd-rating failure → rollback, no review row) |
| G-07 | `reviews.rating` — keep vs deprecate | column | done | Decision executed: **kept, not dropped**; deprecated in the `contract.prisma` comment (G-07 marker) and in code comments; grandfathered rows display it overall-only (G-09) |
| G-08 | Seed: review + rating fixtures | seed row | deferred | Superseded by G-09 grandfathering and the STEP 4 plan: the two COMPLETED appointments are deliberately **unreviewed** so the live review flow is exercised. Review + `review_ratings` rows are exercised by the `db:seed:remove` proof instead (inserted and cascaded inside a rolled-back transaction) |
| G-09 | Pre-existing reviews vs the all-four-categories invariant | seed row | done | Decision: **grandfather** (no backfill of fabricated ratings). Implemented in both read paths: with 4 category rows the overall is the computed 1-dp average; with none, `overallRating` falls back to the legacy `reviews.rating` and `ratings` is null (overall-only). Hosted grandfather count at Gate 0: **0** |
| G-19 | Seed has no MANAGER account | seed row | done | STEP 4: `manager@seed.royalty.local` (role MANAGER, exact enum name) created by the seed's one-time upgrade path; `AuthService.login` returns role MANAGER (status 200) |
| G-28 | `GET /reviews` star filter uses the legacy column | code | done (known limitation) | `reviewListQuerySchema.rating` + `ReviewsService.list` → `Review.where({ rating: query.rating })` filter the **legacy rounded** `reviews.rating`, while the displayed overall is the computed 1-dp average (e.g. 4.5 computed vs 5 stored). Not switched to the computed overall: that would require pre-pagination SQL aggregation and would change list semantics; the admin widget (`App.tsx:281` reads `item.rating`) stays intact. Recorded per decision |
| G-29 | `frontend/admin` has no lint or test scripts | tooling | open (follow-up) | `frontend/admin/package.json` scripts are `dev` / `build` (`tsc && vite build`) / `preview` only — the platform-v1 gate could run the build but no lint or test command exists to gate admin code. Follow-up: add `lint` + `test` scripts (and wire them into the pre-commit gate) |
| G-30 | `backend` has no `vercel.json` of its own — by design | doc | done | The backend deploys as a Vercel service declared in the root `vercel.json` (`services.backend`: `root: backend`, `framework: express`, plus the `/api/(.*)` rewrite to that service), so it needs no `vercel.json` of its own; `frontend/user` and `frontend/admin` keep their per-app configs |
| G-10 | Index on `appointment_services.service_id` | index | done | `idx_appointment_services_service_id` created in migration `20261024T1132_review_ratings` (additive) |
| G-11 | Index on `payments.verified_by` | index | done | `idx_payments_verified_by` created in same migration (additive) |
| G-12 | Index on `schedule_requests.reviewed_by` | index | done | `idx_schedule_requests_reviewed_by` created in same migration (additive) |
| G-13 | RLS policies for the `@@rls` tables | RLS policy | done (hosted check) | Hosted DB probe: `current_user = postgres`, `rolbypassrls = true`, owns all 18 public tables, **0 tables with FORCE ROW LEVEL SECURITY** — backend connections bypass RLS by ownership + bypassrls. Anon/authenticated policy design remains open under section E |
| G-14 | One review per appointment | unique | done | `reviews_appointment_id_key` (contract.prisma:315); enforced in code + 95/95 unit/route tests pass (`npm test`) |
| G-15 | Rating check on `reviews` | check | done | `valid_rating` `((rating >= 1) AND (rating <= 5))` (contract.prisma:325) |
| G-16 | Enum columns use native PG enum types | check | done | 8 `native_enum` types referenced via `pg.enum(...)` (contract.prisma:26–80, 86–128) |
| G-17 | FK coverage — every `_id` column has a FK | key | done | Inventory G.1 lists all 18 FKs with delete rules; no orphan `_id` columns found |
| G-18 | Overlap prevention for `staff_schedules` | unique | needed (decision) | No unique on `(staff_id, day_of_week, effective_from)` and no exclusion constraint (contract.prisma:375–394) |
| G-20 | `GET /appointments/mine`: ADMIN/MANAGER scoping + `hasReview` → `alreadyReviewed` | code | changed | See G.5 — 95/95 tests pass including 3 route tests for the roles |
| G-21 | Runbook `backend/docs/supabase-activation.md` | doc | needed | Phase 5 — written after Phases 2–3 produce the migration + constraint evidence it references |
| G-22 | Index on external `posts.user_id` | index | needed (deferred) | `@@control(external)` — Prisma never touches these tables (contract.prisma:8, 299–311); out of repo scope |
| G-23 | Code reads/writes defined by the schema | code | done | Typed client compiles against `contract.d.ts`: `npm run build` (tsc) clean; every `db.orm.public.*` model in `src/` (Account, Customer, Appointment, AppointmentService, Service, ServiceCategory, Staff, StaffService, StaffSchedule, ScheduleRequest, BusinessHour, Review, AuditLog) exists in the contract; no raw SQL outside migrations (`db.raw`/`pg.raw` grep: only `sql\`` PK defaults in contract.prisma) |
| G-24 | Payments table has no router | code | needed | Already tracked as section B4 — schema exists ahead of code; unchanged this cycle |
| G-25 | Migration-history bookkeeping gap | doc | deferred | The applied history's baseline is an **unnamed 5-op record (2026-09-18, contract `1e8412e1…`)**, while the on-disk `20261005T1356_baseline` package (84 ops, hash `5e6ecb05…`) was never applied under that name. The end state verified clean (`0c3dbaac…` before STEP 1), so this is historical only — **but it is a risk for any fresh environment** (new Supabase project / staging): replaying `prisma db migrate` there may not reconstruct the live schema identically. Deferred per decision: migration history is **not** rewritten; fresh environments must bootstrap with `prisma db init` or run `prisma db verify` immediately after replay |
| G-26 | Hosted target version | doc | done | **PostgreSQL 17.6** is the real target (`select version()` on the hosted DB). The Podman/local Postgres 16 plan is **dropped** per decision; all verification runs against hosted 17.6 |
| G-27 | TLS trust for direct `pg` probes | code | done | STEP 2 connected with `ssl: { ca: <Supabase Root 2021 CA>, rejectUnauthorized: true }` — **TLS verification passed**. CA file: `backend/certs/supabase-ca.crt` (copy of `backend/prod-ca-2021.crt`, subject `CN=Supabase Root 2021 CA`, self-signed root, valid 2021-04-28 → 2031-04-26, PEM, no private key), gitignored (`backend/.gitignore:37`) and absent from `git status`. No verification-disabled fallback was used |

### G.1 Phase 1 schema inventory (source: `src/prisma/contract.prisma`, 416 lines, live-baseline contract)

**Enums (8, native PG types):** `account_role` (ADMIN, MANAGER, STAFF, CUSTOMER), `account_status` (ACTIVE, DEACTIVATED), `appointment_status` (RESERVED, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW), `employment_type` (FULL_TIME, PART_TIME), `payment_method` (CASH, GCASH), `payment_status` (UNVERIFIED, VERIFIED, REJECTED), `schedule_request_status` (PENDING, APPROVED, REJECTED), `staff_work_status` (ON_DUTY, DAY_OFF, UNAVAILABLE).

**Models (18 = 14 app + 4 external):**

| Model (table) | Keys / uniques | Indexes | Checks | FKs (delete rule) | RLS |
| --- | --- | --- | --- | --- | --- |
| Account (accounts) | PK accounts_pkey; unique accounts_email_key | idx_accounts_role, idx_accounts_status | — | — | @@rls |
| Customer (customers) | PK customers_pkey; unique customers_account_id_key | idx_customers_account_id | — | fk_customer_account → accounts (Restrict) | @@rls |
| Appointment (appointments) | PK appointments_pkey; unique appointments_appointment_code_key | idx_appointments_customer_id, idx_appointments_staff_id_date, idx_appointments_date, idx_appointments_date_time, idx_appointments_status | valid_appointment_amount (total ≥ 0), valid_appointment_time (start < end) | fk_appointment_customer → customers (Restrict), fk_appointment_staff → staff (Restrict, index:false) | @@rls |
| ServiceCategory (service_categories) | PK; unique service_categories_name_key | — | — | — | @@rls |
| Service (services) | PK | idx_services_active, idx_services_category_id | service_duration_positive, service_price_positive | fk_service_category → service_categories (Restrict) | @@rls |
| AppointmentService (appointment_services) | PK; **unique (appointment_id, service_id)** | idx_appointment_services_appointment_id | appointment_service_duration_positive, appointment_service_price_positive | fk_appointment_service_appointment → appointments (**Cascade**), fk_appointment_service_service → services (Restrict, index:false) | @@rls |
| AuditLog (audit_logs) | PK | idx_audit_logs_actor, idx_audit_logs_created_at, idx_audit_logs_entity | — | fk_audit_actor → accounts (**SetNull**) | @@rls |
| BusinessHour (business_hours) | PK; **unique day_of_week** | — | valid_business_time, valid_day_of_week (0–6) | — | @@rls |
| Payment (payments) | PK; unique payments_appointment_id_key | idx_payments_created_at, idx_payments_status | payment_amount_positive, valid_verified_payment | fk_payment_appointment → appointments (Restrict), fk_payment_verifier → accounts (Restrict, index:false) | @@rls |
| Review (reviews) | PK; **unique reviews_appointment_id_key (appointment_id)** | idx_reviews_customer_id | valid_rating (1–5) | fk_review_appointment → appointments (Restrict), fk_review_customer → customers (Restrict) | @@rls |
| Staff (staff) | PK; unique staff_account_id_key | idx_staff_account_id, idx_staff_work_status | — | fk_staff_account → accounts (Restrict) | @@rls |
| ScheduleRequest (schedule_requests) | PK | idx_schedule_requests_staff_id, idx_schedule_requests_status | valid_requested_time | fk_schedule_request_reviewer → accounts (Restrict, index:false), fk_schedule_request_staff → staff (**Cascade**) | @@rls |
| StaffSchedule (staff_schedules) | PK | idx_staff_schedules_staff_id | valid_schedule_dates, valid_schedule_day, valid_staff_schedule_time | fk_staff_schedule_staff → staff (**Cascade**) | @@rls |
| StaffService (staff_services) | **composite PK (staff_id, service_id)** | idx_staff_services_service_id | — | fk_staff_services_service → services (Restrict), fk_staff_services_staff → staff (Cascade, index:false) | @@rls |
| ExternalUser / ExternalPost / ExternalUsers / ExternalPosts (user, post, users, posts) | PKs + unique user_email_key / post_authorId_idx / users_username_key / users_email_key | per table | — | post_authorId_fkey (no rule), posts_user_id_fkey (Cascade, index:false) | users/posts @@rls; all four `@@control(external)` — never touched by Prisma |

**Migrations (in order):** `20261005T1356_baseline` (84 ops, from: null → `b1d40866…`) and `20261005T1357_batch3_review` (9 ops, `b1d40866…` → `0c3dbaac…`; adds `appointments.staff_id` + FK/index and three varchar widenings). Each package is `{migration.json (from/to snapshot hashes + migrationHash), migration.ts (typed `Migration<Start,End>` with prechecks + data transforms), ops.json (op list with `classification: additive`, per-op precheck + execute SQL)}`; snapshots hold per-hash contracts; `migrations/app/refs/db.json` is the signed live reference. Header records both migrations as **applied and signed against the live DB**.

### G.2 DB tooling — exact commands (from `package.json` + `prisma --help`, not guessed)

| Purpose | Command |
| --- | --- |
| Regenerate contract artifacts (`contract.json`, `contract.d.ts`) | `npm run contract:emit` → `prisma contract emit` |
| **Generate** a migration from contract changes | `npx prisma migration plan` ("Plan a migration from contract changes"); `npx prisma migration new` scaffolds for manual authoring; `prisma migration check/graph/list/log/show/status` inspect |
| **Apply** migrations | `npm run db:migrate` → `prisma db migrate` ("Apply planned migrations"; takes `--db <url>`) |
| Verify DB vs contract | `npm run db:verify` → `prisma db verify` |
| Bootstrap/sign/update | `prisma db init`, `prisma db sign`, `prisma db update` (all `--db <url>`) |
| Seed | `npm run db:seed` → `tsx scripts/seed.ts seed`; undo: `npm run db:seed:remove` |

### G.3 Code-vs-schema comparison

All tables and columns the services read or write are defined by the contract — the typed client (`postgres<Contract>` over `contract.d.ts`) compiles cleanly (`npm run build` → `tsc`, no errors) and there is no raw SQL in application code (only `sql\`` PK-default expressions in contract.prisma and migration-package SQL). Models used in `src/`: Account, Customer, Appointment, AppointmentService, Service, ServiceCategory, Staff, StaffService, StaffSchedule, ScheduleRequest, BusinessHour, Review, AuditLog. **Not used by code:** Payment (schema ahead of the app — section B4), the four `@@control(external)` tables (by design). `src/prisma/contract-compat.ts` carries defensive shims (`staffIdOf`, `staffWhere`) for columns that predate batch 3 — harmless, kept.

### G.4 Seed coverage (`scripts/seed.ts`, SEED_VERSION 1)

Seeds: 3 accounts (ADMIN, STAFF, CUSTOMER — **no MANAGER**, G-19), 1 customer, 1 staff, 2 categories, N services, N staff_services, 7 business_hours (validated `:493`), weekday staff_schedules, appointments (incl. completed APT-SEED-0003 "enables reviews") + appointment_services. **0 reviews, 0 review_ratings** (G-08). Idempotent by design: deterministic IDs + preflight "clean / already seeded / conflicting" (`:674–706`) — a second run prints "Seed data (SEED_VERSION 1) is already present. Nothing to do." (`:761`); partial datasets are refused, not overwritten. Writes run in one `db.transaction` (`:784`). Live verification of the twice-run behavior is a Phase 3 item.

### G.5 Phase 4 open items (completed this cycle)

- **`GET /appointments/mine` scoping — changed.** Query (before and after): `Appointment.where({ customerId: customer.id })` — filtered by the caller's customer id from `Customer.where({ accountId: token.sub })`, never an unfiltered scan. Before: an ADMIN/MANAGER token with no customer profile got `404 No customer profile found`. After: ADMIN/MANAGER without a customer profile get `200 { appointments: [], total: 0 }` and **no appointment query runs at all**; CUSTOMER behaviour unchanged. Route tests added for CUSTOMER (scoped query asserted `{ customerId }`, own rows only), ADMIN (empty list), MANAGER (empty list).
- **`hasReview` → `alreadyReviewed`** rename applied in `MineAppointmentInfo`, the service, and the tests — now consistent with `CompletedAppointmentInfo`.
- **Frontend 401 handling** — see G.6 (read-only investigation).

### G.11 STEP 6 — verification run (smoke, browser, integration, cancel)

| Item | Type | Status | Evidence |
| --- | --- | --- | --- |
| FE-14 Refresh token unused | code | done (known limitation + follow-up) | `frontend/user` stores `refreshToken` but never calls `POST /auth/refresh` (no `auth/refresh` reference in `src/`). When the 15-min access token expires mid-form, the next submit 401s and the draft stays in memory only — reload or sign-in loses it. Confirmed live: a cached token >15 min old returned 401 on `GET /appointments/mine`. **Follow-up: silent refresh flow (retry once via `/auth/refresh`, then FE-01)** |
| FE-15 BOOK NOW still demo | code | done (follow-up) | `ServiceCard` → `BookingFlow.jsx:90` shows "Demo booking recorded locally in this browser" and writes localStorage; no `POST /appointments` call. **Follow-up: wire the booking flow to the existing route** (`createAppointmentSchema` = staffId + appointmentDate + startTime + serviceIds; totals/end-time computed server-side — verified via the G test booking) |
| FE-16 AppShell `login` regression (found + fixed in STEP 6) | code | done | `AppShell.jsx:15` destructured `login` after STEP 5 renamed it to `signIn`/`signUp` → TypeError after successful sign-in ("Something went wrong"). Restored a legacy `login` setter in `AuthContext`; verified login lands the session and loads data |
| FE-17 Review response unwrap (found + fixed) | code | done | `POST /reviews` returns `{ data: { review } }`; the success handler read the wrapper → chip showed "REVIEWED · 0.0". `ReviewForm` now unwraps `saved.review`; verified chip renders "REVIEWED · 4.5" |
| FE-18 409 message visibility (found + fixed) | code | done | On a duplicate submit the form closed before its message rendered. `handleReviewSuccess` now toasts "You already reviewed this visit." and refreshes; verified live with a stale-form race against a separate writer |
| FE-19 Backend 400s carry no `details` | code | done (known limitation) | Error middleware emits `{ error: { code: 'BAD_REQUEST', message: 'Validation failed' } }` only — no field-level `details`, so field mapping falls back to client-side mirrors. `Signin` now mirrors `philippineMobileSchema` (`/^\+?[0-9\s\-()]{7,20}$/`, `validation.ts:190`): invalid mobile shows "Enter a valid mobile number, such as 09XX XXX XXXX." **Follow-up: add zod issue `details` to error responses** |
| FE-20 FE-01 test suite | code | done | vitest added (`npm test`): **12/12 pass** — error mapping (400/401/403/409/500/network/envelope), exp check, and the 5 FE-01 cases (expired CUSTOMER clears; wrong-role STAFF keeps; network keeps; 500 keeps; CUSTOMER 401 + `/api/me` 200 keeps) + the `/api/me` 401 clears case. Lint 0, build ✓ |
| FE-21 CORS live check | code | done | curl preflight from `http://localhost:5174` → 204 + full CORS headers; from `https://evil.example` → 204 with **no** CORS headers; no `Allow-Credentials` anywhere |
| FE-22 API smoke (hosted) | code | done | 4 logins 200 + role match; CUSTOMER `/appointments/mine` returns APT-SEED-0003/0005 with services, staff name, totals, `alreadyReviewed: false`, `review: null`; MANAGER/ADMIN → empty list; **STAFF → 401** (route gate `requireRole('CUSTOMER','ADMIN','MANAGER')` at `routes/appointments.ts:33` beats the service's empty-list branch — deviation from the expected empty list, same wrong-role 401 design as `/reviews`); STAFF `POST /reviews` → 401 `Access denied. Required roles: CUSTOMER`; unauth → 401 `Missing or malformed authorization header` |
| FE-23 Real review + cleanup | code | done | UI review on APT-SEED-0003 (5/4/5/4 + comment) through the real `db.transaction`: SQL shows 1 reviews row (`ec8a2619-…`, **legacy 5** = rounded 4.5) + exactly 4 rating rows with own IDs; read path shows **4.5**; stale-form 409 body `{"error":{"code":"CONFLICT","message":"This appointment has already been reviewed"}}`; test reviews deleted by exact ID with cascade 8→4→0; counts restored to the baseline |
| FE-24 Atomicity failure-injection | doc | done (limitation) | Not possible as specified: a trigger created inside a `BEGIN … ROLLBACK` is invisible to the API's pool connection (uncommitted DDL), and committing one exceeds the sanctioned scope. **Atomicity is proven by the mocked service test only** (STEP 3: injected 3rd-rating failure → 500 + zero surviving rows) |
| FE-25 Browser checks (headless Chromium) | code | done | STAFF/MANAGER/ADMIN each show "No access: this page is for customer accounts…" on customer screens and survive reload; expired-token session clears and prompts sign-in without a crash; backend stopped → valid session kept + "Try again" (never cleared); invalid mobile shows the field error; console: 0 errors / 0 CORS mentions from app code (one collector-script error of my own); no horizontal scrollbar at 375 or 1280 on Appointments / review form / sign-in modal (scrollW == clientW) |
| FE-26 Integration suite (hosted) | code | done | `reviews.integration.test.ts` runs against the hosted DB (pre-check: scope-marker ownership, no TRUNCATE, deletes only its rows): **16/16 pass** in 50 s; cleanup removed exactly its rows (2 appointment_services, 1 review, 2 appointments, 1 customer, 1 account) with `remaining: all 0` and APT-SEED-0003 asserted untouched |
| FE-27 Cancel flow | code | done | Future RESERVED throwaway created via `POST /appointments` (`APT-D1D365E3-…`, ₱1,050, 10:00–11:45 computed server-side), cancelled through the UI as CUSTOMER → SQL `status: CANCELLED`; deleted by exact ID; counts restored |

### G.10 STEP 5 — API client, auth, CORS (frontend/user + backend)

| Item | Type | Status | Evidence |
| --- | --- | --- | --- |
| FE-01 Session rule (401 handling) | code | done | `frontend/user/src/lib/api.js` `sessionDispositionAfter401(role)`: non-CUSTOMER 401 → keep session (wrong-role); CUSTOMER → client `exp` check first (expired → clear) then probe **`GET /api/me`** (role-agnostic endpoint, exists at `src/server.ts`): 401 → clear + prompt sign-in, 200/5xx/network → keep. Network errors and 5xx never clear the session. Used by `Appointments.jsx` on load and cancel. No fallback limitation needed — `/api/me` exists |
| FE-02 API client | code | done | `frontend/user/src/lib/api.js`: `VITE_API_URL`-driven (documented in `frontend/user/.env.example`, no secrets in VITE_), Authorization header attached from session, backend `{ error: { code, message, details } }` parsed into typed errors (NetworkError, ValidationError 400, AuthError 401 unauthenticated / 403 no-access, ConflictError 409, ServerError 5xx); no token logging anywhere |
| FE-03 CORS | code | done | `backend/src/middleware/cors.ts`: allowlist from `CORS_ORIGINS` (comma-separated, optional in `src/config/env.ts`), default `http://localhost:5173/5174` + `http://127.0.0.1:5173/5174` (admin pins 5173; user `vite` defaults 5173 and steps to 5174). **No wildcard ever**. `Access-Control-Allow-Headers: Content-Type, Authorization`; credentials **off** (bearer tokens, no cookies). Deployed origin: set `CORS_ORIGINS` when supplied (not invented). 4 tests in `src/routes/cors.test.ts` (allowed gets headers; unlisted gets none; preflight 204; env-driven, no wildcard) |
| FE-04 Token storage | code | done | `frontend/user`: **sessionStorage** (`royalty-auth`), chosen because localStorage tokens are XSS-readable; sessionStorage dies with the tab. Tokens are never logged. **RISK (recorded): `frontend/admin` stores `accessToken`/`refreshToken` in localStorage (`src/lib/api.ts` `clearAccessTokens`) — XSS exposure; recommend migrating admin to sessionStorage/httpOnly cookies** |
| FE-05 Sign-up + Google | code | done | `POST /auth/register` exists → sign-up wired (`Signin.jsx` → `AuthService.register`, CUSTOMER role; phone field added — `registerSchema` requires PH mobile; email must be Gmail per `gmailSchema`, 400s map to fields). Google buttons have **no backend route** → they create no session and show "Sign-up isn't available yet." (FE follow-up: Google OAuth) |
| FE-06 Appointments page | code | done | `Appointments.jsx` now loads `GET /appointments/mine` with pagination (prev/next, page x of y). Fields mapped: services list (name + duration + price), `totalAmount`, **staff name** (payload extended additively: `MineAppointmentInfo.staff` in `appointments.service.ts`), date + `startTime–endTime`. Status labels: RESERVED → **Pending**; NO_SHOW → **"No-show"**, grouped under the **Past** tab (a missed visit is a past outcome). Loading / empty / error / no-access states all present |
| FE-07 Cancel | code | done | Wired to `PATCH /appointments/:id/status` with `{status: 'CANCELLED'}` — a customer cancel route **exists** (customer-only CANCELLED, before start time; 403/409 surfaced as messages). No localStorage cancel remains. **Reschedule**: the demo dialog was removed (it only patched localStorage); no reschedule is offered — FE follow-up (a PATCH update route exists but its reschedule semantics were not verified) |
| FE-08 Review button + form | code | done | "LEAVE A REVIEW" once per COMPLETED item with `alreadyReviewed: false`; "REVIEWED · n.n" (overall to 1 dp, falls back to the legacy overall when `ratings` is null); hidden for all other statuses. `ReviewForm.jsx`: 4 required star radiogroups (Service, Products, Staff customer service, Time management) with aria-labels + keyboard radios, optional comment with 2000-char counter, POST body exactly `{appointmentId, ratings: {service, products, staff, timeManagement}, comment?}`; submit disabled in flight; 409 → "You already reviewed this visit." + item refresh; 400 details map to fields; success updates the item without reload; comments render as text only (no `dangerouslySetInnerHTML`) |
| FE-09 `GET /reviews` star filter on legacy column | code | done (known limitation) | See G-28 (4.5 computed vs 5 stored); admin widget untouched |
| FE-10 MyReviews demo records | doc | done (follow-up) | `MyReviews.jsx` reads localStorage `royalty-reviews` demo records (populated by the old review flow and seeded demo data) and would render them **next to real reviews**. Left alone per instruction. **Recommendation: drop the `royalty-reviews` localStorage path (or gate to `import.meta.env.DEV`) once real reviews are in use, and clear stale keys** |
| FE-11 Housekeeping | code | done | `backend/.env`: 3 stale `SEED_*_PASSWORD` lines removed (values never printed). `backend/.env.example` history contains only **empty** defaults (`SEED_*_PASSWORD=""`); no plaintext passwords in git history or committed code (checked `git log -p .env.example` + `git rev-list --all` grep) |
| FE-12 Frontend test runner | doc | done (limitation) | `frontend/user` has **no test runner** (`dev/build/lint/preview` only) — the requested client-error-mapping and FE-01 unit tests were therefore not added; behaviour is covered by the 105 backend tests (incl. CORS) + lint 0 + build. Adding vitest is an FE follow-up |
| FE-13 Bundle secret scan | code | done | `dist/assets/*.js` scanned for passwords/tokens/private keys/`postgres://`/JWT fragments — none found (only a chunk filename `ChangePassword-*.js` matched) |

### G.9 STEP 4 — seed dataset (ALL rows are TEST DATA)

Every row below is **test data** (reserved `@seed.royalty.local` domain, `APT-SEED-%` codes, deterministic UUIDs). Delete with `SEED_REMOVE_CONFIRM=royalty-seed-delete npm run db:seed:remove` (or rotate the passwords) **before real customers use this database**.

| Table | Rows (test data) | Notes |
| --- | --- | --- |
| accounts | 4 | `admin`/`customer`/`staff`/`manager@seed.royalty.local` (roles ADMIN/CUSTOMER/STAFF/MANAGER); passwords rotated to `crypto.randomBytes` values in STEP 4, written once to gitignored `backend/.seed-credentials.local` |
| customers | 1 | Ada Reyes (seed profile) |
| staff | 1 | Maria Santos (Senior Stylist, PART_TIME, ON_DUTY) + staff_schedules (Mon/Tue) + staff_services (all 4 services) |
| service_categories / services | 2 / 4 | Hair, Nails; Signature Haircut, Hair Color, Gel Manicure, Spa Pedicure |
| business_hours | 7 | Mon–Sat open, Sunday closed |
| appointments | 5 | `APT-SEED-0001..0005`; **two COMPLETED visits with two services + seed staff + no review**: `APT-SEED-0003` (Gel Manicure + Spa Pedicure, 09:00–11:15, ₱1,550.00) and `APT-SEED-0005` (Gel Manicure + Spa Pedicure, 13:00–15:15, ₱1,550.00) |
| appointment_services | 9 | denormalised snapshots; totals/end-times recomputed consistently when `APT-SEED-0003` gained its second service |
| reviews / review_ratings | 0 / 0 | seeded appointments stay unreviewed (G-08 deferred) |

Seed behaviour (STEP 4): passwords are **generated** (`crypto.randomBytes`, 20 chars, mixed case + digits) and hashed with the repo's bcrypt (cost 12); the one-time **upgrade path** rotates the pre-existing account passwords, adds MANAGER, extends `APT-SEED-0003`, and creates `APT-SEED-0005` — afterwards every deterministic ID exists so re-runs are no-ops and never rotate again (proven: run 2 printed "already present. Nothing to do." with identical counts and identical password-hash digests). `db:seed:remove` now deletes **reviews first** (their `review_ratings` cascade) before the appointments (`reviews.appointment_id` is ON DELETE RESTRICT), then appointment_services → appointments → schedules → staff_services → services → business_hours → categories → staff → customers → accounts — proven FK-safe on the hosted DB inside `BEGIN … ROLLBACK` (proof review + 4 ratings inserted, full removal ran without FK errors, cascade emptied `review_ratings`, counts restored exactly after ROLLBACK). All four accounts authenticate via `AuthService.login` (200, role matches, no tokens logged).

### G.6 Frontend 401 handling — investigation result (read-only, no code changed)

**Question:** would a wrong-role 401 from a backend route clear a staff user's session? **Answer: No.**

- **`frontend/user`** has **no HTTP layer at all** — repo search for `fetch|axios|XMLHttpRequest|WebSocket|EventSource` and for `401|Unauthorized` returns **0 matches**. Auth is local demo state (`AuthContext.jsx:12-13`: "Sign-in stays a local UI preview … the session lives in localStorage only"); login persists `royalty-user` (`Login.jsx:53`, `Signin.jsx:48`), logout removes it (`AuthContext.jsx:22-26`), and `main.jsx:7-10` clears it on every browser launch. A backend 401 cannot reach this app, so it cannot clear anything.
- **`frontend/admin`** has **no global 401 handling and never clears the session on any HTTP status**. `apiFetch` (`api.ts:1431-1434`) is a bare `fetch` wrapper with no interceptor; `response.status` / `status === 401` / `UNAUTHORIZED` / `error.code` have **zero matches** in admin `src` (the only literal 401s are the dev mock adapter's own `errorResponse` payloads, `api.ts:702-1274`). Failures are handled per request: `!response.ok` → `throw new Error(payload?.error?.message …)` shown in the UI (`staff/staffApi.ts:90-96`, `App.tsx:439, 883-884, 916`) or silently swallowed (`App.tsx:288` `.catch(() => setData([]))`).
- **Session clearing exists only in the two explicit sign-out buttons**: `App.tsx:555-560` (admin sidebar) and `staff/StaffShell.tsx:121-124` — both run `clearAccessTokens()` (`api.ts:218-225`) + `clearAccountSession()` (`session.ts:50-56`). `session.ts:88-107` helpers are read-only and never validate against the server.
- **Nuance:** handling is per-request and status-agnostic, so a wrong-role 401 (e.g. a valid staff/manager token on a CUSTOMER-only route — which the backend returns as `401 UNAUTHORIZED`, not 403) leaves the staff user signed in and only shows an error message (or nothing). The backend's `error.code` is never inspected anywhere (`staffApi.ts:93` reads `error.message` only). The mock adapter's wrong-role response is 403 (`api.ts:703-704`) and likewise surfaces only as a message.
