# Google One Tap + GCash Payments — Setup Guide

Customer-facing sign-in with Google Identity Services and manual GCash
payments (online deposits with proof verification, in-person settlement).

## 1. Google Cloud Console (one-time, account action)

1. Open <https://console.cloud.google.com/apis/credentials> and select the
   project that owns the OAuth client (or create a project first).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: e.g. `Royalty customer web`.
   - **Authorized JavaScript origins** (no redirect URI is needed — this
     integration verifies ID tokens server-side):
     - `http://localhost:5173` (customer dev server)
     - `http://localhost:5174` (alternate dev port)
     - `https://royalty-user.vercel.app` (production customer origin)
   - Save and copy the client ID (`…apps.googleusercontent.com`). It is a
     public identifier; the OAuth client *secret* is never used here.
3. If the OAuth consent screen is in "Testing" mode, add the salon's Google
   accounts as test users (or publish the app) before customers can sign in.

Configuration (never hardcode in source):

| Where | Variable | Example |
|---|---|---|
| `backend/.env` | `GOOGLE_CLIENT_ID` | `123-abc.apps.googleusercontent.com` |
| `frontend/user/.env` | `VITE_GOOGLE_CLIENT_ID` | same value |

`.env.example` files carry placeholders only.

## 2. Sign-in behavior

- **Continue with Google** button and a One Tap prompt in the customer app.
  Password login keeps working; if Google's script fails to load (or the
  browser blocks it), Google options simply disappear.
- New Google sign-ins create **CUSTOMER** accounts only (no password; linked
  by the stable Google `sub`). Google sign-in is **not** offered in the admin
  app; STAFF/MANAGER/ADMIN keep password sign-in.
- **Accounts are never merged silently.** If a password account already uses
  the same email, the customer gets: *"An account with this email already
  exists. Sign in with your password to continue."*
- Only `email_verified` Google tokens are accepted; the token audience must
  equal `GOOGLE_CLIENT_ID`.

## 3. GCash payments (manual verification)

Policy (as configured):

1. **Online GCash — pay in full**: customer pays the server-calculated
   outstanding amount, uploads a reference number + payment proof.
2. **Online GCash — 40% down payment**: customer pays 40% of the
   server-calculated appointment total (remaining balance due at the salon).
3. **Pay at the salon**: nothing collected online; cash or GCash in person,
   recorded by staff after receiving the money.

All amounts are computed by the server from the authoritative appointment
total. The browser never supplies prices or deposit amounts.

### Admin → Payment Settings (local admin app)

- Upload the salon's GCash **QR image** (PNG/JPG), set the **receiver name**
  and **masked account number** (e.g. `09•• ••• 1234` — never the full number).
- Down payment policy: `NONE`, `FIXED`, or `PERCENT` with a value. The
  deposit rate is one server-side setting, **DEPOSIT_PERCENT = 40**. Setting `NONE` hides the
  down-payment option for customers.

### Verification workflow

- Online submissions land as **UNVERIFIED** (awaiting verification) with
  proof + reference. ADMIN/MANAGER verify or reject them (one-way; a
  confirmed transaction can never be re-confirmed).
- In-person payments (cash or GCash) are recorded by STAFF/MANAGER/ADMIN
  after receiving the money and count as verified immediately. The recording
  amount can never exceed the outstanding balance.
- Outstanding = appointment total − sum of verified transactions. A verified
  online deposit automatically reduces what is due at the salon.
- References are unique across all transactions (a GCash reference can never
  be credited twice) and every action is written to the audit log.

## 4. Deployment notes

- The **admin app stays local** (never deployed to production).
- The customer app deploys to `https://royalty-user.vercel.app` with
  `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL` set in the Vercel project
  environment; the backend needs `GOOGLE_CLIENT_ID` in its environment.
- Payment proof images and the QR live in the `salon-media` bucket under
  `payments/` (private writes through the backend only).
