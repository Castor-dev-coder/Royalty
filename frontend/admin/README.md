# Royalty Admin

Run the admin UI locally with `npm install` (once) and `npm run dev` from this directory.

## Development demo data

When running Vite in development with `VITE_API_URL` unset or blank, the UI uses a browser-only mock API with fictional accounts, customers, staff, services, appointments, reviews, schedules, and payments. The first visit creates a dataset in `localStorage`; later visits and screens share its changes. The **Development demo** banner identifies mock mode, and **Reset demo data** restores its original sample dataset.

Sign in to enable writes with:

- Email: `admin@seed.royalty.local`
- Password: `RoyaltyDemo2026!`

The demo includes 12 fictional accounts (administrator, manager, staff and customers), 5 customer profiles, 4 staff profiles, 3 service categories, 6 services, 10 appointments, 10 linked payments, reviews and recurring schedules. It covers reserved, confirmed, completed, cancelled and no-show appointments; unverified, verified and rejected payments; active and deactivated accounts; and varied staff availability. IDs and foreign-key references are stable within the demo dataset.

The demo supports account creation and status changes, staff profile edits, date-specific staff time-off create/edit/remove, service and category management, appointment confirmation/completion/cancellation, payment verification/rejection, payment history/search, and dashboard summaries. Service removal is a soft archive so historical appointments remain intact. Account/password are local demonstration credentials only; no password is stored in the mock dataset. Demo sign-in uses separate, namespaced browser keys and does not overwrite live access or refresh tokens.

For payment verification, enter the last five digits of the appointment reference after removing its prefix (for example, `RS-48219` uses code `48219`). The payment flow only changes browser-stored demo records; it does not process a payment. To return to the initial fixture, use **Reset demo data** in the development banner. Resetting is available only while mock mode is active and does not touch the backend database.

To use a configured backend, set `VITE_API_URL` to its base URL. The UI then uses the real API and does not fall back to fictional records if that backend is unavailable. `VITE_USE_MOCK_API=true` explicitly selects the mock adapter for local development even when an API URL is set. Vite's production build always disables the adapter.

The current backend does not register payment or payment-verification-code endpoints, provide administrator account provisioning, or support date-specific staff time off. Those capabilities are available only in the isolated development demo; live mode uses the configured APIs and reports unsupported payment/account provisioning features as unavailable. No database seed/reset command is run by the admin app, and existing database seed utilities are unchanged.

## Validation

Run `npm run build` to type-check and build the admin UI.
