/**
 * One month view over the appointment records.
 *
 * The dashboard's summary cards and its month panel read through the same
 * exported selector, so a count shown in one place is the same number shown
 * in the other. There is no second query and no payments table involved:
 * every figure is a view over the bookings the page already loaded, each of
 * which carries its price as `totalAmount`.
 *
 * Month bucketing rules:
 *  - The booking's own calendar date (`appointmentDate`) is already Manila
 *    wall-clock, so its month is taken from the date string itself.
 *  - When only a datetime instant exists (`createdAt` and friends), the
 *    month is taken in Asia/Manila — the studio's operating timezone — via
 *    Intl.DateTimeFormat, never by slicing the raw UTC string. A UTC slice
 *    would drop bookings created in the evening of the 1st (still the 30th
 *    in UTC) out of their real month.
 */

/** The subset of a booking record the month view needs. */
export interface MonthBookingLike {
  /** Manila calendar date of the booking, as `YYYY-MM-DD`. */
  appointmentDate?: string | null;
  /** Manila wall-clock start time, as `HH:MM`. */
  startTime?: string | null;
  /** When the booking record was created (an instant). */
  createdAt?: string | number | Date | null;
  /** The booking price, in PHP. */
  totalAmount?: number | string | null;
  /** Booking lifecycle state. */
  status?: string | null;
}

export interface MonthSelection<T extends MonthBookingLike> {
  /** The `YYYY-MM` bucket this selection was taken from. */
  monthKey: string;
  /** The bookings that fall in the month. */
  bookings: T[];
  /** The number of bookings in the month — what the month panel counts. */
  count: number;
  /** The sum of the bookings' prices — what the month panel shows. */
  totalAmount: number;
}

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}/;

const manilaMonthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
});

const manilaDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The `YYYY-MM` month an instant falls in, in Asia/Manila.
 *
 * Accepts anything `Date` can parse. Returns null for a value that is not a
 * real instant, so a bad record is left out rather than guessed at.
 */
export function manilaMonthKey(instant: string | number | Date): string | null {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  // en-CA formats as YYYY-MM-DD; the month is the first two segments.
  return manilaMonthFormatter.format(date).slice(0, 7);
}

/**
 * The `YYYY-MM-DD` calendar date an instant falls in, in Asia/Manila.
 * Returns null for a value that is not a real instant.
 */
export function manilaDateKey(instant: string | number | Date): string | null {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  return manilaDayFormatter.format(date);
}

/**
 * The month a booking belongs to.
 *
 * The booked day decides: `appointmentDate` is the Manila calendar date of
 * the appointment itself. Only when that is missing does the record's
 * creation instant decide — converted to Asia/Manila, never sliced as UTC.
 */
export function bookingMonthKey(booking: MonthBookingLike): string | null {
  const dateKey = booking.appointmentDate != null ? String(booking.appointmentDate) : '';
  if (DATE_KEY_PATTERN.test(dateKey)) return dateKey.slice(0, 7);
  if (booking.createdAt != null) return manilaMonthKey(booking.createdAt);
  return null;
}

/** The PHP price carried by a booking. A missing or bad price counts as zero. */
function bookingPrice(booking: MonthBookingLike): number {
  const value = Number(booking.totalAmount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Select the bookings of one month, with the count and price total that the
 * summary cards and the month panel both render from.
 *
 * `monthKey` is a `YYYY-MM` string (see {@link manilaMonthKey}).
 */
export function selectMonthBookings<T extends MonthBookingLike>(
  appointments: readonly T[],
  monthKey: string,
): MonthSelection<T> {
  const normalized = MONTH_KEY_PATTERN.test(monthKey) ? monthKey.slice(0, 7) : monthKey;
  const bookings = appointments.filter((booking) => bookingMonthKey(booking) === normalized);
  return {
    monthKey: normalized,
    bookings,
    count: bookings.length,
    totalAmount: bookings.reduce((sum, booking) => sum + bookingPrice(booking), 0),
  };
}

/** The `YYYY-MM` month happening now, in Asia/Manila. */
export function currentManilaMonthKey(now: Date = new Date()): string {
  return manilaMonthKey(now) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** The `YYYY-MM-DD` day happening now, in Asia/Manila. */
export function currentManilaDateKey(now: Date = new Date()): string {
  return manilaDateKey(now) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
