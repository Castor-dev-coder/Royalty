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
