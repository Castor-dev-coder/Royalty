import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestError } from '../../errors/index.js';
import { calendarAvailabilityQuerySchema, createAppointmentSchema } from './appointments.schemas.js';
import {
  buildAvailableStartWindows,
  calculateEndTime,
  canTransitionStatus,
  dateOnly,
  hasAppointmentTimePassed,
  isoDayOfWeek,
  sumDecimalStrings,
  timeRangesOverlap,
} from './appointments.rules.js';

const id = '00000000-0000-4000-8000-000000000001';

test('booking input ignores client-owned customer and price fields', () => {
  const parsed = createAppointmentSchema.safeParse({
    staffId: id,
    appointmentDate: '2099-01-01',
    startTime: '09:00',
    serviceIds: [id],
    customerId: id,
    totalAmount: 0.01,
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal('customerId' in parsed.data, false);
    assert.equal('totalAmount' in parsed.data, false);
  }
});

test('booking input rejects empty, duplicate, and malformed service selections', () => {
  const base = { staffId: id, appointmentDate: '2099-01-01', startTime: '09:00' };
  assert.equal(createAppointmentSchema.safeParse({ ...base, serviceIds: [] }).success, false);
  assert.equal(createAppointmentSchema.safeParse({ ...base, serviceIds: [id, id] }).success, false);
  assert.equal(createAppointmentSchema.safeParse({ ...base, startTime: '9:00', serviceIds: [id] }).success, false);
});

test('appointment end time sums service durations and rejects crossing midnight', () => {
  assert.equal(calculateEndTime('09:40', [30, 20]), '10:30');
  assert.throws(() => calculateEndTime('23:30', [30]), BadRequestError);
});

test('decimal service prices sum without floating-point rounding', () => {
  assert.equal(sumDecimalStrings(['9.99', '0.01', '2.5']), '12.5');
});

test('time ranges use half-open boundaries for adjacent appointments', () => {
  assert.equal(timeRangesOverlap('09:00', '10:00', '10:00', '10:30'), false);
  assert.equal(timeRangesOverlap('09:00', '10:01', '10:00', '10:30'), true);
});

test('appointment weekdays use ISO numbering', () => {
  assert.equal(isoDayOfWeek('2026-09-28'), 1);
  assert.equal(isoDayOfWeek('2026-10-04'), 7);
});

test('same-day future checks use the configured studio timezone', () => {
  const appointmentDate = dateOnly('2026-01-01');
  const now = new Date('2025-12-31T16:00:00.000Z');
  assert.equal(hasAppointmentTimePassed(appointmentDate, '09:00', now, 'Asia/Manila'), false);
  assert.equal(hasAppointmentTimePassed(appointmentDate, '00:00', now, 'Asia/Manila'), true);
});

test('calendar availability returns continuous start windows around bookings', () => {
  assert.deepEqual(buildAvailableStartWindows(
    [{ startTime: '09:00', endTime: '17:00' }],
    [{ startTime: '10:00', endTime: '11:00' }, { startTime: '13:00', endTime: '14:00' }],
    60
  ), [
    { startTime: '09:00', latestStartTime: '09:00' },
    { startTime: '11:00', latestStartTime: '12:00' },
    { startTime: '14:00', latestStartTime: '16:00' },
  ]);
});

test('calendar query accepts at most 31 inclusive dates and rejects reversed ranges', () => {
  assert.equal(calendarAvailabilityQuerySchema.safeParse({
    from: '2026-10-01', to: '2026-10-31', serviceIds: id,
  }).success, true);
  assert.equal(calendarAvailabilityQuerySchema.safeParse({
    from: '2026-10-01', to: '2026-11-01', serviceIds: id,
  }).success, false);
  assert.equal(calendarAvailabilityQuerySchema.safeParse({
    from: '2026-10-02', to: '2026-10-01', serviceIds: id,
  }).success, false);
});

test('appointment statuses only follow the permitted forward transitions', () => {
  assert.equal(canTransitionStatus('RESERVED', 'CONFIRMED'), true);
  assert.equal(canTransitionStatus('CONFIRMED', 'NO_SHOW'), true);
  assert.equal(canTransitionStatus('COMPLETED', 'CANCELLED'), false);
});