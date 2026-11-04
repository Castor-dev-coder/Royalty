import { describe, expect, it } from 'vitest';
import {
  bookingMonthKey,
  currentManilaMonthKey,
  manilaMonthKey,
  selectMonthBookings,
  type MonthBookingLike,
} from './dashboard-month';

/**
 * Two October bookings, recorded with their real edges:
 *
 *  - The first starts 00:30 on Oct 1 Manila, so its record was created at
 *    16:30 on Sep 30 UTC. A naive UTC slice of `createdAt` calls it
 *    September and drops it from the month.
 *  - The last starts 23:30 on Oct 31 Manila (15:30 Oct 31 UTC), the other
 *    edge of the same month.
 *
 * Both carry their price as `totalAmount`, and their statuses are one
 * RESERVED and one COMPLETED — the month must hold both.
 */
const octoberBookings: MonthBookingLike[] = [
  {
    appointmentDate: '2026-10-01',
    startTime: '00:30',
    createdAt: '2026-09-30T16:30:00.000Z',
    status: 'RESERVED',
    totalAmount: 1500,
  },
  {
    appointmentDate: '2026-10-31',
    startTime: '23:30',
    createdAt: '2026-10-31T15:30:00.000Z',
    status: 'COMPLETED',
    totalAmount: 2200,
  },
];

describe('selectMonthBookings', () => {
  it('puts both Manila edge-of-month bookings in the October bucket', () => {
    const selection = selectMonthBookings(octoberBookings, '2026-10');
    expect(selection.bookings).toHaveLength(2);
    expect(selection.count).toBe(2);
    expect(selection.bookings.map((booking) => booking.status).sort()).toEqual(['COMPLETED', 'RESERVED']);
  });

  it('shows the price total as the sum of the bookings in the month', () => {
    const selection = selectMonthBookings(octoberBookings, '2026-10');
    const expected = octoberBookings.reduce((sum, booking) => sum + Number(booking.totalAmount), 0);
    expect(selection.totalAmount).toBe(expected);
    expect(selection.totalAmount).toBe(1500 + 2200);
  });

  it('gives the month panel the same count as the summary cards (same selector output)', () => {
    const summary = selectMonthBookings(octoberBookings, '2026-10');
    const monthPanel = selectMonthBookings(octoberBookings, '2026-10');
    expect(monthPanel.count).toBe(summary.count);
    expect(monthPanel.totalAmount).toBe(summary.totalAmount);
    // The count the panel prints is the length of the same selection.
    expect(summary.count).toBe(summary.bookings.length);
  });

  it('miscounts under a naive UTC slice of createdAt — the fixtures guard the timezone rule', () => {
    // Documented intent of the fixtures: slicing createdAt as UTC drops the
    // Sep 30 UTC record, so the naive bucket holds one booking, not two.
    const naiveUtcBucket = octoberBookings.filter((booking) => String(booking.createdAt).slice(0, 7) === '2026-10');
    expect(naiveUtcBucket).toHaveLength(1);
    expect(selectMonthBookings(octoberBookings, '2026-10').count).toBe(2);
  });

  it('buckets a record that only has createdAt by its Asia/Manila month', () => {
    // 2026-09-30T16:30Z is already October in Manila.
    const createdAtOnly: MonthBookingLike[] = [{ createdAt: '2026-09-30T16:30:00.000Z', totalAmount: 900 }];
    expect(manilaMonthKey('2026-09-30T16:30:00.000Z')).toBe('2026-10');
    expect(bookingMonthKey(createdAtOnly[0])).toBe('2026-10');
    const selection = selectMonthBookings(createdAtOnly, '2026-10');
    expect(selection.count).toBe(1);
    expect(selection.totalAmount).toBe(900);
  });

  it('leaves other months and non-bookings out', () => {
    const withOtherMonths: MonthBookingLike[] = [
      ...octoberBookings,
      { appointmentDate: '2026-11-01', startTime: '09:00', createdAt: '2026-10-31T16:00:00.000Z', status: 'RESERVED', totalAmount: 700 },
    ];
    const selection = selectMonthBookings(withOtherMonths, '2026-10');
    expect(selection.count).toBe(2);
    expect(selection.totalAmount).toBe(1500 + 2200);
  });

  it('reads the current month in Asia/Manila', () => {
    // 16:30 UTC on Sep 30 is Oct 1 in Manila.
    expect(currentManilaMonthKey(new Date('2026-09-30T16:30:00.000Z'))).toBe('2026-10');
  });
});
