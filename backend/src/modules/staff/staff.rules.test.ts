import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleStaffQuerySchema } from './staff.schemas.js';
import { isStaffEligibleForServices } from './staff.rules.js';

const serviceOne = '00000000-0000-4000-8000-000000000001';
const serviceTwo = '00000000-0000-4000-8000-000000000002';

test('eligible staff query requires unique valid service IDs', () => {
  assert.equal(eligibleStaffQuerySchema.safeParse({ serviceIds: `${serviceOne},${serviceTwo}` }).success, true);
  assert.equal(eligibleStaffQuerySchema.safeParse({ serviceIds: '' }).success, false);
  assert.equal(eligibleStaffQuerySchema.safeParse({ serviceIds: `${serviceOne},${serviceOne}` }).success, false);
  assert.equal(eligibleStaffQuerySchema.safeParse({ serviceIds: 'not-a-uuid' }).success, false);
});

test('eligible staff must be ON_DUTY and assigned to every selected service', () => {
  assert.equal(isStaffEligibleForServices('ON_DUTY', [serviceOne, serviceTwo], [serviceOne, serviceTwo]), true);
  assert.equal(isStaffEligibleForServices('ON_DUTY', [serviceOne], [serviceOne, serviceTwo]), false);
  assert.equal(isStaffEligibleForServices('DAY_OFF', [serviceOne, serviceTwo], [serviceOne, serviceTwo]), false);
  assert.equal(isStaffEligibleForServices('UNAVAILABLE', [serviceOne, serviceTwo], [serviceOne]), false);
});