import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPersonName,
  isPhilippineMobile,
  normalizePhilippineMobile,
} from './validation.js';
import { createStaffSchema, updateOwnStaffProfileSchema } from '../modules/staff/staff.schemas.js';
import { createCustomerSchema, updateCustomerSchema } from '../modules/customers/customers.schemas.js';
import { createServiceSchema, updateServiceSchema } from '../modules/services/service.schemas.js';
import { loginSchema, registerSchema } from '../schemas/index.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const categoryId = '00000000-0000-4000-8000-000000000002';

// Names that are real: Filipino compound surnames, middle initials,
// accented letters, the Spanish Ñ, an apostrophe, a hyphen and a suffix.
const ACCEPTED_NAMES = [
  'Juan Dela Cruz',
  'Maria Clara Santos',
  'Ma. Cristina Reyes',
  'Angelica Mae Dela Peña',
  'Niño García',
  "José O'Connor",
  'Anne-Marie Villanueva',
  'Juan Dela Cruz Jr.',
  'Juan Dela Cruz III',
  'Ann Marie O\'Brien',
  'Pedro Jr.',
];

// Names that are not: digits, emoji, arbitrary symbols and empty values.
const REFUSED_NAMES = [
  '',
  '   ',
  'Juan123',
  '12345',
  'Juan ⚡ Cruz',
  'Juan @ Cruz',
  'Juan_Cruz',
  '<script>alert(1)</script>',
];

test('a personal name accepts Filipino and international names', () => {
  for (const name of ACCEPTED_NAMES) {
    assert.equal(isPersonName(name, true), true, `expected ${name} to be accepted`);
  }
});

test('a personal name refuses digits, symbols and empty values', () => {
  for (const name of REFUSED_NAMES) {
    assert.equal(isPersonName(name, true), false, `expected ${name} to be refused`);
  }
});

test('a suffix is only accepted where the field allows one', () => {
  assert.equal(isPersonName('Juan Dela Cruz Jr.', true), true);
  assert.equal(isPersonName('Juan Dela Cruz Jr.', false), false);
  assert.equal(isPersonName('Juan Dela Cruz III', true), true);
  assert.equal(isPersonName('Juan Dela Cruz II', true), true);
});

test('a name that is only a suffix is refused', () => {
  assert.equal(isPersonName('Jr.', true), false);
  assert.equal(isPersonName('III', true), false);
});

test('a personal name is trimmed before it is checked', () => {
  assert.equal(isPersonName('  Juan Dela Cruz  ', true), true);
  assert.equal(isPersonName('\t\nJuan Dela Cruz\n', true), true);
});

test('a Philippine mobile number accepts both written forms', () => {
  assert.equal(isPhilippineMobile('09171234567'), true);
  assert.equal(isPhilippineMobile('+639171234567'), true);
  assert.equal(isPhilippineMobile('0917-555-1100'), true);
  assert.equal(isPhilippineMobile('  0917 555 1100  '), true);
});

test('a Philippine mobile number refuses the wrong length, prefix and letters', () => {
  assert.equal(isPhilippineMobile('0917123456'), false);
  assert.equal(isPhilippineMobile('091712345678'), false);
  assert.equal(isPhilippineMobile('08171234567'), false);
  assert.equal(isPhilippineMobile('0917ABC4567'), false);
  assert.equal(isPhilippineMobile('9171234567'), false);
  assert.equal(isPhilippineMobile(''), false);
});

test('a mobile number is stored in one of the two accepted forms', () => {
  assert.equal(normalizePhilippineMobile('0917-555-1100'), '09175551100');
  assert.equal(normalizePhilippineMobile('09175551100'), '09175551100');
  assert.equal(normalizePhilippineMobile('+63 917 555 1100'), '+639175551100');
  assert.equal(normalizePhilippineMobile('9175551100'), '09175551100');
});

test('the staff schema applies the name and mobile rules', () => {
  const valid = createStaffSchema.safeParse({
    accountId,
    firstName: 'Maria Clara',
    lastName: 'Dela Peña',
    phone: '0917-555-1100',
    primaryRole: 'Senior Stylist',
    employmentType: 'PART_TIME',
  });
  assert.equal(valid.success, true);

  const badName = createStaffSchema.safeParse({
    accountId,
    firstName: 'Maria 123',
    lastName: 'Dela Peña',
    primaryRole: 'Senior Stylist',
    employmentType: 'PART_TIME',
  });
  assert.equal(badName.success, false);

  const badPhone = createStaffSchema.safeParse({
    accountId,
    firstName: 'Maria Clara',
    lastName: 'Dela Peña',
    phone: '555-0100',
    primaryRole: 'Senior Stylist',
    employmentType: 'PART_TIME',
  });
  assert.equal(badPhone.success, false);
});

test('a staff member may change their own phone number', () => {
  const result = updateOwnStaffProfileSchema.safeParse({ phone: '0917-555-1100' });
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.phone, '09175551100');

  const empty = updateOwnStaffProfileSchema.safeParse({});
  assert.equal(empty.success, true);

  const bad = updateOwnStaffProfileSchema.safeParse({ phone: 'not a number' });
  assert.equal(bad.success, false);
});

test('the customer schema applies the name and mobile rules', () => {
  const valid = createCustomerSchema.safeParse({
    accountId,
    firstName: 'Juan',
    lastName: 'Dela Cruz Jr.',
    phone: '+639171234567',
  });
  assert.equal(valid.success, true);
  assert.equal(valid.success && valid.data.phone, '+639171234567');

  const bad = createCustomerSchema.safeParse({
    accountId,
    firstName: 'Juan ⚡',
    lastName: 'Dela Cruz',
  });
  assert.equal(bad.success, false);

  const updated = updateCustomerSchema.safeParse({ firstName: "Anne-Marie O'Brien" });
  assert.equal(updated.success, true);
});

test('the service schema accepts a peso amount and refuses a malformed one', () => {
  const valid = createServiceSchema.safeParse({
    categoryId,
    name: 'Haircut',
    price: 800.5,
    durationMinutes: 60,
  });
  assert.equal(valid.success, true);

  const threeDecimals = createServiceSchema.safeParse({
    categoryId,
    name: 'Haircut',
    price: 800.555,
    durationMinutes: 60,
  });
  assert.equal(threeDecimals.success, false);

  const negative = createServiceSchema.safeParse({
    categoryId,
    name: 'Haircut',
    price: -50,
    durationMinutes: 60,
  });
  assert.equal(negative.success, false);

  const zero = createServiceSchema.safeParse({
    categoryId,
    name: 'Haircut',
    price: 0,
    durationMinutes: 60,
  });
  assert.equal(zero.success, false);

  const duration = createServiceSchema.safeParse({
    categoryId,
    name: 'Haircut',
    price: 800,
    durationMinutes: 30.5,
  });
  assert.equal(duration.success, false);
});

test('a service can be updated with a valid amount only', () => {
  assert.equal(updateServiceSchema.safeParse({ price: 1200 }).success, true);
  assert.equal(updateServiceSchema.safeParse({ price: -1 }).success, false);
  assert.equal(updateServiceSchema.safeParse({ price: 1200.005 }).success, false);
  assert.equal(updateServiceSchema.safeParse({ durationMinutes: 301 }).success, false);
});

test('the registration schema applies the name and mobile rules', () => {
  const valid = registerSchema.safeParse({
    email: 'maria.clara@gmail.com',
    password: 'Str0ng!Pass',
    firstName: 'Maria Clara',
    lastName: 'Dela Peña',
    phone: '09175551100',
  });
  assert.equal(valid.success, true);

  const badName = registerSchema.safeParse({
    email: 'maria.clara@gmail.com',
    password: 'Str0ng!Pass',
    firstName: 'Maria 123',
    lastName: 'Dela Peña',
  });
  assert.equal(badName.success, false);
});

test('a new account is given a Gmail address', () => {
  const valid = registerSchema.safeParse({
    email: 'maria.clara@gmail.com',
    password: 'Str0ng!Pass',
    firstName: 'Maria Clara',
    lastName: 'Dela Peña',
  });
  assert.equal(valid.success, true);

  // The domain has to be gmail.com, and nothing else.
  const refused = [
    'maria.clara@example.test',
    'maria.clara@seed.royalty.local',
    'maria.clara@gmail.com.example',
    'maria.clara@gmail.co',
    'maria.clara@sub.gmail.com',
  ];
  for (const email of refused) {
    const result = registerSchema.safeParse({
      email,
      password: 'Str0ng!Pass',
      firstName: 'Maria Clara',
      lastName: 'Dela Peña',
    });
    assert.equal(result.success, false, `expected ${email} to be refused`);
  }
});

test('a Gmail address is matched without regard to case', () => {
  for (const email of ['maria.clara@gmail.com', 'Maria.Clara@GMAIL.COM', 'maria.clara@GmAiL.cOm']) {
    const result = registerSchema.safeParse({
      email,
      password: 'Str0ng!Pass',
      firstName: 'Maria Clara',
      lastName: 'Dela Peña',
    });
    assert.equal(result.success, true, `expected ${email} to be accepted`);
  }
});

test('a malformed address is refused', () => {
  const refused = [
    '@gmail.com',
    'maria.clara@',
    'maria.clara@@gmail.com',
    'maria clara@gmail.com',
    'maria.clara@gmail',
    'maria.clara@gmail.',
  ];
  for (const email of refused) {
    const result = registerSchema.safeParse({
      email,
      password: 'Str0ng!Pass',
      firstName: 'Maria Clara',
      lastName: 'Dela Peña',
    });
    assert.equal(result.success, false, `expected ${email} to be refused`);
  }
});

test('signing in accepts an address on any domain', () => {
  // The demo, seeded and test accounts do not all share one domain, and an
  // account is never asked to change its address just to be able to sign in.
  const addresses = [
    'admin@seed.royalty.local',
    'staff@seed.royalty.local',
    'elena.morales@example.test',
    'marco.villanueva@example.test',
    'customer@example.com',
    'someone@gmail.com',
  ];
  for (const email of addresses) {
    const result = loginSchema.safeParse({ email, password: 'Str0ng!Pass' });
    assert.equal(result.success, true, `expected ${email} to be accepted`);
  }
});
