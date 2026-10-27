// Booking-window rules: new appointments may only be booked inside the
// current Asia/Manila calendar month (and never in the past). Pure rules with
// an explicit "now" date, so every boundary — including the Manila midnight
// rollover, which is 16:00 UTC — is tested deterministically.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertWithinBookingMonth, bookingMonthWindow, localDateAndTime } from './appointments.rules.js';

const MANILA = 'Asia/Manila';

test('the window of a month is its first through last day', () => {
  assert.deepEqual(bookingMonthWindow('2026-10-27'), {
    first: '2026-10-01',
    last: '2026-10-31',
    monthKey: '2026-10',
  });
});

test('February lengths follow the leap-year rule', () => {
  assert.equal(bookingMonthWindow('2024-02-10').last, '2024-02-29');
  assert.equal(bookingMonthWindow('2026-02-10').last, '2026-02-28');
});

test('December closes the year at the 31st', () => {
  assert.deepEqual(bookingMonthWindow('2026-12-05'), {
    first: '2026-12-01',
    last: '2026-12-31',
    monthKey: '2026-12',
  });
});

test('a date inside the current month is accepted, including its last day', () => {
  assert.doesNotThrow(() => assertWithinBookingMonth('2026-10-01', '2026-10-27'));
  assert.doesNotThrow(() => assertWithinBookingMonth('2026-10-27', '2026-10-27'));
  assert.doesNotThrow(() => assertWithinBookingMonth('2026-10-31', '2026-10-27'));
});

test('a date in any other month is rejected with a clear validation error', () => {
  for (const date of ['2026-11-01', '2026-11-18', '2026-12-31', '2026-09-30', '2027-01-01']) {
    assert.throws(
      () => assertWithinBookingMonth(date, '2026-10-27'),
      (error: Error & { statusCode?: number }) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /current calendar month/i);
        return true;
      },
      `expected ${date} to be rejected`,
    );
  }
});

test('the month follows the Manila calendar date of the instant, not the UTC date', () => {
  // 15:59 UTC on Oct 31 is still Oct 31 in Manila; 16:01 UTC is already Nov 1.
  const beforeMidnight = localDateAndTime(new Date('2026-10-31T15:59:00Z'), MANILA).date;
  const afterMidnight = localDateAndTime(new Date('2026-10-31T16:01:00Z'), MANILA).date;
  assert.equal(beforeMidnight, '2026-10-31');
  assert.equal(afterMidnight, '2026-11-01');
  assert.equal(bookingMonthWindow(beforeMidnight).monthKey, '2026-10');
  assert.equal(bookingMonthWindow(afterMidnight).monthKey, '2026-11');
  assert.doesNotThrow(() => assertWithinBookingMonth('2026-10-31', beforeMidnight));
  assert.throws(() => assertWithinBookingMonth('2026-10-31', afterMidnight), /current calendar month/i);
  assert.doesNotThrow(() => assertWithinBookingMonth('2026-11-01', afterMidnight));
});
