# Royalty Admin

Run the admin UI locally with `npm install` (once) and `npm run dev` from this directory.

## Development demo data

When running Vite in development with `VITE_API_URL` unset or blank, the UI uses a browser-only mock API with fictional accounts, customers, staff, services, appointments, reviews, schedules, and payments. The first visit creates a dataset in `localStorage`; later visits and screens share its changes. The **Development demo** banner identifies mock mode, and **Reset demo data** restores its original sample dataset.

Sign in to enable writes with:

- Email: `admin@seed.royalty.local`
- Password: `RoyaltyDemo2026!`

A staff member signs in with:

- Email: `elena.morales@example.test`
- Password: `RoyaltyDemo2026!`

Both sets of details are shown on the sign-in screen itself, under
**Development demo accounts**, each with its own labelled block and a copy
button for the email and the password. The values are read from the mock
adapter's own constants, so what the screen shows is exactly what the adapter
accepts. They are fictional browser-only credentials and are never sent to a
real API.

The demo includes 12 fictional accounts (administrator, manager, staff and customers), 5 customer profiles, 4 staff profiles, 3 service categories, 6 services, 10 appointments, 10 linked payments, reviews and recurring schedules. It covers reserved, confirmed, completed, cancelled and no-show appointments; unverified, verified and rejected payments; active and deactivated accounts; and varied staff availability. IDs and foreign-key references are stable within the demo dataset.

The demo supports account creation and status changes, staff profile edits, date-specific staff time-off create/edit/remove, service and category management, appointment confirmation/completion/cancellation, payment verification/rejection, payment history/search, and dashboard summaries. Service removal is a soft archive so historical appointments remain intact. Account/password are local demonstration credentials only; no password is stored in the mock dataset. Demo sign-in uses separate, namespaced browser keys and does not overwrite live access or refresh tokens.

## Staff dashboard

A staff member signs in at `/my` and gets a separate panel with its own
navigation: **My Day**, **My Appointments**, **My Schedule**, **My Services**
and **My Profile**. It shares the administrator's shell, typography, theme
tokens, sidebar pattern, cards, tables and dialogs, but it exposes only what a
staff member may act on — their own bookings, their own recurring schedule and
schedule requests, their own service assignments, and their own account and
profile details. Signing in with a staff account never lands on the
administrator routes, and requesting one sends the session back to `/my`.

Sign in as a staff member with:

- Email: `elena.morales@example.test`
- Password: `RoyaltyDemo2026!`

The demo also includes `jules.navaro@example.test`, `mika.tan@example.test` and
`bea.lim@example.test` with the same password. Bea's account is deactivated,
so it cannot sign in; the rest have different bookings, availability and
service assignments, which makes the per-member scoping visible.

The staff experience is authorised by the API, not by hiding controls. The
staff routes are `GET /staff/me`, `PATCH /staff/me`,
`GET /appointments/staff/me`, `GET /schedules/me`, `GET /schedules/requests/me`,
`POST /schedules/requests`, `GET /services/staff/me/services`,
`GET /accounts/me`, `PATCH /accounts/me` and `POST /accounts/me/password`.
Each resolves the signed-in member from the token's account ID, so a staff
member can only ever read or change their own records. The administrator
routes stay restricted to the administrator and manager roles.

Account access and staff availability are separate and are shown separately.
`Account.status` decides whether the account may sign in; `Staff.workStatus`
decides whether the staff member is working, off, or unavailable. The staff
directory lists them in two columns, **Account Access** and **Availability**,
and the administrator can deactivate or restore an account's sign-in without
touching the staff profile, schedule, or bookings. Deactivating an account
blocks sign-in; a day off does not.

Two states are deliberately distinct in the demo data: `bea.lim@example.test`
has a deactivated account and is unavailable, `mika.tan@example.test` has an
active account and is on a day off.

For payment verification, enter the last five digits of the appointment reference after removing its prefix (for example, `RS-48219` uses code `48219`). The payment flow only changes browser-stored demo records; it does not process a payment. To return to the initial fixture, use **Reset demo data** in the development banner. Resetting is available only while mock mode is active and does not touch the backend database.

To use a configured backend, set `VITE_API_URL` to its base URL. The UI then uses the real API and does not fall back to fictional records if that backend is unavailable. `VITE_USE_MOCK_API=true` explicitly selects the mock adapter for local development even when an API URL is set. Vite's production build always disables the adapter.

The current backend does not register payment or payment-verification-code endpoints, provide administrator account provisioning, or support date-specific staff time off. Those capabilities are available only in the isolated development demo; live mode uses the configured APIs and reports unsupported payment/account provisioning features as unavailable. No database seed/reset command is run by the admin app, and existing database seed utilities are unchanged.

## Validation

Run `npm run build` to type-check and build the admin UI.

## Stylesheet scripts

`scripts/apply-scale.py` applies the spacing and typography scale to
`src/styles.css`. It rewrites the file in place, so it is a maintenance tool
rather than part of the build. The script is guarded: it refuses to write if
the number of media queries or rule blocks changes, or if the braces become
unbalanced, so a mis-matched selector cannot silently drop a responsive
rule. No npm script references it and nothing else in the repository depends
on it.

## Appearance

The admin interface ships a Light, Dark and System appearance control in the
page header. The choice is stored in `localStorage` under
`royalty.admin.theme` and applied to the `data-theme` attribute on `<html>`.
An inline script in `index.html` applies the stored value before first paint,
so the interface never flashes the wrong surface on load. `System` follows the
operating system's `prefers-color-scheme` setting and updates live when that
setting changes.

All colours resolve through the token layer at the top of `src/styles.css`.
Light values live in `:root` and dark values in the `[data-theme='dark']`
block; the two blocks define the same token names, so a component never needs
theme-specific rules of its own.

## Login screen photography

The login screen's right-hand panel uses the approved salon photographs in
`public/images`. They are the same images published by the customer-facing
site, re-encoded to progressive JPEG at the sizes below.

| File | Subject | Size |
| --- | --- | --- |
| `salon-coloring.jpg` | Stylist applying colour product to a client | 1024 × 1024 |
| `salon-styling.jpg` | Curling a highlighted section with a heated tool | 643 × 752 |
| `salon-hero.jpg` | Editorial salon portrait | 1000 × 563 |

To replace them, keep the same file names and drop the new images into
`public/images`. Recommended for a replacement photo: JPEG, progressive,
quality 82, at least 1400 px on the long edge, roughly 4:3 or portrait. The
panel crops with `object-fit: cover`, so a photo stays readable when it is
wider or taller than the panel. The slideshow crossfades between them, pauses
on hover and on keyboard focus, and does not auto-advance at all when the
operating system requests reduced motion.

### The photography panel on smaller screens

The photography panel is a desktop feature. At 1024 px and below it is
removed entirely with `display: none` rather than being stacked below the
form, so the sign-in form gets the whole viewport and no blank region is
left behind. Above 1024 px the split-screen layout is unchanged: form on the
left, photography on the right.

The rule lives in its own `@media (max-width: 1024px)` block in
`src/styles.css`, placed before the 760 px rules so those can still refine
the form's own spacing.
