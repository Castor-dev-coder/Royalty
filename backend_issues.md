# Backend issues

## Decisions (2026-10-27)

- **The hosted schema from the unapproved `db update` is ACCEPTED, not rolled
  back.** It matches the contract, the payments tables were empty, and no data
  rows changed. Consequences: there is no DB-level one-payment-per-appointment
  rule (`payments_appointment_id_key` was dropped — code guards only), and
  `accounts.password_hash` is nullable.
- **Migration-history repair (G-25, the `placeholder()` stubs in
  `20261026T1435_google_gcash_payments/migration.ts`) stays DEFERRED** and
  needs its own approval before any migration work.
- **Hosted writes stay unauthorized** until a separate block explicitly grants
  them (test-only rows/files with exact-ID cleanup, never schema or seed data).

## Issues

- **Hosted payment test (2026-10-27) — PASS with one skipped item.** Live-verified:
  browser booking (40% label, server-calculated ₱720/₱1,800), full/deposit/balance
  payments, normalized duplicate reference 409 ("reference already used"),
  overpayment 409, two simultaneous recordings (one 201/one 409, totals
  consistent), proof privacy (unauth direct + public-style object URLs 400;
  signed URLs 200 for owner/MANAGER/ADMIN, 403 STAFF, 404 other customer,
  expired token 400), verify permissions (STAFF 401; MANAGER verified
  TESTFULL01/TESTDEP01, ADMIN verified TESTBAL01; double confirm 409; audit
  actors correct). Two defects found and fixed locally: stale local backend
  serving pre-fix code (restarted; old `assertProofsBucket` 404-path bug), and
  `signedProofUrl` percent-encoding the path separator (`InvalidSignature`;
  fixed with per-segment encoding + regression tests, backend suite 220/220).
  Item f (admin UI code-input + counter recording) skipped after UI state
  failures — its input contract is unit-covered (`AppointmentCodeInput`
  strips a pasted "APT-"); not re-attempted. Test rows (4 appointments,
  4 payments incl. race winner `ca808b9c…`, 13 audit rows, 4 objects,
  settings row `61b467be…`, test account `08a8958b…`) deleted by exact ID;
  counts back to baseline 5/1/7/11/0/0/1/4/1, both buckets empty, marker
  `3aec5a97…` unchanged.

- **G-25 — migration graph replay fails (2026-10-27).** The on-disk migration
  graph cannot reproduce the hosted marker (`3aec5a97…`) on a fresh database:
  the plan omits the pre-tooling legacy tables (`user`, `users`, `post`,
  `posts`), and `db init`/`db update` refuse to create them (their
  `autoincrement()` defaults are outside the tooling's DDL). A throwaway
  container could only be built by bootstrapping those four tables by hand and
  then running `db update`. Migration-history repair is **deferred** (not
  attempted; no history was rewritten).
- **Payment-proof bucket check failed on hosted storage (2026-10-27) — root
  cause VERIFIED, fix applied locally.** `assertProofsBucket`
  (`backend/src/modules/images/storage.ts`) probed
  `GET /storage/v1/buckets/payment-proofs` (plural), which the storage API does
  not route — it answers 404 `Route GET:/buckets/... not found` (read-only
  probe confirmed; the service role is fine). The bucket endpoint is singular
  (`GET /storage/v1/bucket/:id` → 200, `public: false`), and the earlier
  hypothesis (single-bucket GET vs bucket-list permission issue) was wrong.
  Fix: probe the singular route and report an unrouted-endpoint 404 distinctly
  from a missing bucket, so a routing regression cannot masquerade as a missing
  bucket again. Regression tests: `src/modules/images/storage.test.ts` (6,
  pass). Backend unit suite 208/208. Hosted proof-upload re-test is still
  **pending authorization** (not run).
