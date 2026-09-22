# Project Status — Royalty Hair & Nails Studio Backend

Last updated: 2026-09-22

## Completed

- [x] Project foundation: Node.js + Express + Strict TypeScript + Prisma
- [x] Supabase PostgreSQL connection (existing DB, RLS enabled)
- [x] Backend JWT authentication (separate access/refresh secrets)
- [x] Accounts module (register, login, refresh, getMe, logout, CRUD, pagination)
- [x] Customers module (profile CRUD, pagination)
- [x] Staff module (profile CRUD, employment fields, work status, authorization)
- [x] Services module (categories, services, staff-service assignments, `is_active`, DECIMAL price handling)
- [x] Schedules module (business hours, staff schedules, schedule requests, overlap detection, DAY_OFF handling)

## Accounts

Implemented:
- Register (creates account + customer profile + sends email)
- Login (returns access + refresh tokens)
- Refresh token endpoint
- Get current user (`/auth/me`)
- Logout (invalidates refresh token)
- List accounts (ADMIN/MANAGER only, paginated)
- Get account by ID (own or ADMIN/MANAGER)
- Update account (own profile or ADMIN/MANAGER)
- Delete account (own or ADMIN/MANAGER)
- Password change (own or ADMIN/MANAGER for admins)
- Role management (ADMIN/MANAGER only)
- Status management (ACTIVE/DEACTIVATED, ADMIN/MANAGER only)

Important decisions:
- JWT access token: 15 minutes, HS256
- JWT refresh token: 7 days, HS256, stored in DB
- Role values: ADMIN, MANAGER, STAFF, CUSTOMER (enum strings)
- "Cannot deactivate the only active ADMIN" is a pending business-rule decision, NOT implemented
- Database-level pagination with 1-100 limit clamp, `createdAt` descending
- Prisma 8 RC query API: `.where().first()`, `.where().all()`, `.where().count()`, `.orderBy().skip().take().all()`
- Password hash never exposed in responses
- Audit logging for sensitive operations (fire-and-forget)

## Services

Implemented:
- Service categories: CRUD, `is_active` toggle, unique name constraint
- Services: CRUD, `is_active` toggle, unique name within category, DECIMAL price storage
- Staff-service assignments: assign staff to services, remove assignments, list assignments
- Authorization: ADMIN/MANAGER only for all service operations

Key behaviors:
- `is_active` field on both `service_categories` and `services` — respected in service creation (cannot add to inactive category), update, and response
- Price stored as PostgreSQL DECIMAL, API accepts/returns number, Prisma handles string conversion internally
- Customer-facing service/category read access is DEFERRED to the appointment/customer booking flow — not implemented yet

## Schedules

### Business Hours
- `GET /schedules/business-hours` — list all 7 days (ADMIN, MANAGER)
- `PATCH /schedules/business-hours` — replace entire week atomically (ADMIN, MANAGER)
- ISO day numbering: 1=Monday through 7=Sunday
- Time format: 24-hour HH:MM (e.g., 09:00, 17:30)
- Validation: exactly 7 days, no duplicate dayOfWeek, valid HH:MM, open < close when isOpen=true
- **Atomic transaction**: delete all existing + insert 7 new in one transaction; partial state impossible

### Staff Schedules
- `GET /schedules/staff` — list all (ADMIN, MANAGER)
- `GET /schedules/staff/:id` — by staff ID (ADMIN, MANAGER, or own STAFF)
- `GET /schedules/staff/me` — own schedules (STAFF)
- `POST /schedules/staff` — create (ADMIN, MANAGER)
- `PATCH /schedules/staff/:id` — update (ADMIN, MANAGER)
- `DELETE /schedules/staff/:id` — delete (ADMIN, MANAGER)
- Fields: dayOfWeek (1-7), startTime, endTime, effectiveFrom, effectiveUntil (nullable), isActive
- **Overlap detection**: checks time-range overlap AND effective-date-range overlap against all active schedules for same staff + dayOfWeek; rejects on conflict
- **DAY_OFF handling**: rejects active schedule creation/update when staff.workStatus === 'DAY_OFF'
- DAY_OFF limitation: schema has no expiry field; only current status is checked (see Deferred Decisions)

### Schedule Requests
- `GET /schedules/requests` — list all (ADMIN, MANAGER)
- `GET /schedules/requests/me` — own requests (STAFF)
- `GET /schedules/requests/:id` — by ID (ADMIN, MANAGER, or own STAFF)
- `POST /schedules/requests` — create (STAFF only)
- `PATCH /schedules/requests/:id/approve` — approve (ADMIN, MANAGER)
- `PATCH /schedules/requests/:id/reject` — reject (ADMIN, MANAGER)
- requestType: free-form string, max 20 chars (DB constraint)
- Only PENDING → APPROVED/REJECTED; cannot re-review already reviewed requests
- reviewed_by + reviewed_at set atomically with status change
- Cannot approve/reject own request

### Authorization
- CUSTOMER has no scheduling access
- STAFF can view own schedules, create requests, view own requests
- ADMIN/MANAGER can manage all schedules, approve/reject requests
- Business hours: ADMIN/MANAGER only (read and write)

### Known Limitations
- Schedule overlap detection: conflict query and insert/update are NOT atomic. Concurrent requests could race. Acceptable for current use case but not strictly serializable.
- DAY_OFF has no expiry field in the database. Only current `work_status` is checked. If the business needs expiring DAY_OFF periods, schema change required.

## Important Deferred Decisions

These are known limitations or decisions deferred to future work. They are NOT approved requirements for schema changes.

1. **Appointment availability must use business hours.** The business hours data exists but is not yet used to validate appointment times. This will be implemented in the Appointments module.

2. **Appointment creation must reject inactive services.** Service `is_active` is tracked but not yet enforced at appointment creation time. Will be implemented in the Appointments module.

3. **Customer-facing service/category read access** is deferred to the appointment/customer booking flow. Currently all service endpoints require ADMIN/MANAGER. Will be finalized when implementing customer booking.

4. **DAY_OFF has no expiry field** in the database. Only the current `staff.work_status` is checked. If the business needs DAY_OFF periods with automatic expiry, a schema change would be required (e.g., `day_off_until TIMESTAMPTZ`). Not currently approved.

5. **Schedule request approval does NOT automatically create a staff schedule.** Approval only changes the request status to APPROVED. A separate staff_schedule record must be created manually by an ADMIN/MANAGER. This is a workflow gap that may need resolution.

6. **Schedule overlap detection has a possible concurrency race.** The conflict check query and the insert/update are not wrapped in a transaction. Two concurrent requests could both pass the check and create overlapping schedules. This is acceptable for current low-contention use but not strictly serializable. A unique partial index or `SELECT ... FOR UPDATE` could address this, but would require schema or implementation changes.

7. These are known limitations/deferred decisions, not approved requirements for schema changes. Do not modify the database schema without explicit approval.

## Next Module

**Next module: Appointments**

The Appointments module will need to integrate:
- Customers (customer_id, customer profile data)
- Services (service selection, active state check, price/duration snapshots into appointment_services)
- Business hours (validate appointment time against business hours)
- Staff schedules (validate staff availability against schedule)
- Staff work status (DAY_OFF, ON_DUTY, UNAVAILABLE)
- Appointment conflicts (double-booking prevention)
- Appointment status workflow (RESERVED → CONFIRMED → COMPLETED/CANCELLED/NO_SHOW)
- Appointment codes (unique appointment_code)
- Transactions (appointment + appointment_services created atomically)
- Authorization (customers can manage own appointments, STAFF/ADMIN/MANAGER can manage all)

Existing database schema is the source of truth. Do not modify schema without explicit approval.

## Repository State

- Branch: main
- Working tree: dirty (uncommitted changes)
- Build: passing (`npm run build` exits 0)
- Prisma contract: passing (`npm run contract:emit` exits 0)
- Tests: none yet (not blocking)
