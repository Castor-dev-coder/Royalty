import { db } from './db.js';

/**
 * Adapters between the application's plain types and the Prisma 8 contract.
 *
 * Two independent concerns live here because both exist only to bridge a
 * deliberate mismatch. Each block is labelled with the batch that removes it.
 */

/* ------------------------------------------------------------------------- *
 * Prisma 8 branded numeric
 *
 * `Numeric(10, 2)` reads back as `string & { __numericPrecision, __numericScale }`.
 * The live columns really are `numeric(p10,s2)` and the driver returns plain
 * decimal strings (e.g. '30.00'), so the brand carries no runtime information:
 * it only stops a bare `string` from being written without a cast.
 *
 * Permanent: this is how Prisma 8 models numeric columns.
 * ------------------------------------------------------------------------- */

type ServicePrice = Awaited<ReturnType<typeof db.orm.public.Service.create>>['price'];

/** Casts a validated decimal string to the numeric type the contract requires. */
export function pgNumeric(value: string): ServicePrice {
  return value as ServicePrice;
}

/* ------------------------------------------------------------------------- *
 * Prisma 8 branded varchar
 *
 * `VarChar(n)` is declared for the 21 live `varchar(n)` columns because plain
 * `String` maps to PostgreSQL `text` and would misdescribe the database. The
 * generated type is `{ readonly __varcharLength: n }`, which is a compile-time
 * fiction only: at runtime a branded value is still a plain string, so
 * `JSON.stringify` and `String()` behave identically and PostgreSQL still
 * enforces the length.
 *
 * The brand only stops a bare `string` from reaching a write. `pgVarchar` is the
 * single sanctioned crossing point, so no service needs an inline cast and the
 * brand cannot leak past the persistence boundary into API or Zod types.
 *
 * Permanent: this is how Prisma 8 models varchar columns.
 * ------------------------------------------------------------------------- */

import type { Varchar } from '@prisma/orm-postgres/target/codec-types';

/** Casts a validated string to the varchar type the contract requires. */
export function pgVarchar<N extends number>(value: string): Varchar<N> {
  return value as Varchar<N>;
}

/* ------------------------------------------------------------------------- *
 * Pending `appointments.staff_id` (Batch 3)
 *
 * The live database has no `appointments.staff_id` column, so the contract
 * cannot declare it and the baseline must not pretend it exists. The appointment
 * module, however, was written against the target schema: it scopes availability
 * and conflict lookups by staff, assigns staff on create, and authorises STAFF
 * through `appointment.staffId`.
 *
 * These helpers keep that pending column in one place. Until Batch 3 adds the
 * column, `staffIdOf` reports no assignment (fail-closed, so STAFF authorisation
 * cannot be satisfied) and the query helpers emit the intended filter, which
 * Batch 3 makes type-checkable natively. Delete this block once the column lands;
 * call sites then use `appointment.staffId` and the plain filter objects again.
 * ------------------------------------------------------------------------- */

/** Reads the pending `staff_id`, or null while the column does not exist. */
export function staffIdOf(row: object): string | null {
  const value = (row as { staffId?: unknown }).staffId;
  return typeof value === 'string' ? value : null;
}

type AppointmentFilter = Parameters<typeof db.orm.public.Appointment.where>[0];

/**
 * Builds an appointment query filter that includes the pending `staff_id`.
 *
 * Typed against the ORM's own filter type so the unknown key is carried rather
 * than rejected, and so the filter keeps whatever real conditions the caller
 * already had. The cast is confined to this one function and disappears with the
 * rest of the block once Batch 3 declares `staff_id`.
 */
export function staffWhere(filter: AppointmentFilter & { staffId: string }): AppointmentFilter {
  return filter;
}

/**
 * Adds the pending `staff_id` to a create payload.
 *
 * Same reason as `staffWhere`: the payload must be a value, not a literal, or
 * the unknown key is rejected.
 */
export function withStaffAssignment<T extends object>(
  data: T,
  staffId: string
): T & { staffId: string } {
  return { ...data, staffId };
}