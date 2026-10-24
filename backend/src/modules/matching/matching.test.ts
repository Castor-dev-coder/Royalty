import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { matchStaff, NEUTRAL_RATING }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./matching.service.js'),
]);

// ---- tiny in-memory world -------------------------------------------------
const CAT_CUT = 'cat-cutting';
const CAT_COLOR = 'cat-coloring';
const CAT_NAILS = 'cat-nails';

interface Fixture {
  services: Array<Record<string, unknown>>
  staff: Array<Record<string, unknown>>
  accounts: Array<Record<string, unknown>>
  staffCategories: Array<Record<string, unknown>>
  appointments: Array<Record<string, unknown>>
  reviews: Array<Record<string, unknown>>
  reviewRatings: Array<Record<string, unknown>>
}

const world: Fixture = {
  services: [
    { id: 'svc-cut', categoryId: CAT_CUT, name: 'Haircut', durationMinutes: 45, isActive: true, price: 450 },
    { id: 'svc-color', categoryId: CAT_COLOR, name: 'Color', durationMinutes: 120, isActive: true, price: 1800 },
    { id: 'svc-nails', categoryId: CAT_NAILS, name: 'Mani', durationMinutes: 60, isActive: true, price: 600 },
  ],
  staff: [],
  accounts: [],
  staffCategories: [],
  appointments: [],
  reviews: [],
  reviewRatings: [],
};

function resetWorld(): void {
  world.staff = [];
  world.accounts = [];
  world.staffCategories = [];
  world.appointments = [];
  world.reviews = [];
  world.reviewRatings = [];
}

function addStaff(id: string, opts: {
  categories?: string[]
  workStatus?: string
  ratings?: number[]
  bookings?: Array<{ date: string; start: string; end: string; status?: string }>
} = {}): void {
  world.accounts.push({ id: `acc-${id}`, status: 'ACTIVE', isSystem: false });
  world.staff.push({
    id,
    accountId: `acc-${id}`,
    firstName: 'Stylist',
    lastName: id.toUpperCase(),
    primaryRole: 'Stylist',
    workStatus: opts.workStatus ?? 'ON_DUTY',
    photoUrl: null,
    position: null,
    coveredRoles: [],
    showOnTeam: false,
  });
  for (const categoryId of opts.categories ?? []) {
    world.staffCategories.push({ staffId: id, categoryId });
  }
  const reviews = opts.ratings ?? [];
  reviews.forEach((rating, index) => {
    const appointmentId = `apt-${id}-${index}`;
    world.appointments.push({
      id: appointmentId,
      staffId: id,
      appointmentDate: '2026-11-02',
      startTime: '08:00',
      endTime: '08:30',
      status: 'COMPLETED',
    });
    world.reviews.push({ id: `rev-${id}-${index}`, appointmentId });
    world.reviewRatings.push({ reviewId: `rev-${id}-${index}`, category: 'STAFF', rating });
  });
  for (const booking of opts.bookings ?? []) {
    world.appointments.push({
      id: `apt-busy-${id}-${world.appointments.length}`,
      staffId: id,
      appointmentDate: booking.date,
      startTime: booking.start,
      endTime: booking.end,
      status: booking.status ?? 'CONFIRMED',
    });
  }
}

function matches(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function table(getRows: () => Array<Record<string, unknown>>) {
  return {
    where: (filter: Record<string, unknown>) => ({
      first: async () => getRows().find((row) => matches(row, filter)) ?? null,
      all: async () => getRows().filter((row) => matches(row, filter)),
    }),
    all: async () => getRows(),
  };
}

(db as unknown as { orm: unknown }).orm = {
  public: {
    Service: table(() => world.services),
    Staff: table(() => world.staff),
    Account: table(() => world.accounts),
    StaffCategory: table(() => world.staffCategories),
    Appointment: table(() => world.appointments),
    Review: table(() => world.reviews),
    ReviewRating: table(() => world.reviewRatings),
  },
};

const SLOT = { date: '2026-11-02', startTime: '10:00' };

test('full cover: recommends the top-ranked staff with a reason', async () => {
  resetWorld();
  addStaff('s-strong', { categories: [CAT_CUT, CAT_COLOR], ratings: [5, 5, 5] });
  addStaff('s-weak', { categories: [CAT_CUT, CAT_COLOR], ratings: [3, 3, 3] });
  const result = await matchStaff({ serviceIds: ['svc-cut', 'svc-color'], ...SLOT });
  assert.equal(result.partial, false);
  assert.equal(result.recommended?.id, 's-strong');
  assert.match(result.reason, /Covers all 2 categories/);
  assert.deepEqual(result.alternatives.map((entry) => entry.id), ['s-weak']);
});

test('partial cover: nobody covers everything, labels stay "covers X of Y", no auto-select', async () => {
  resetWorld();
  addStaff('s-half', { categories: [CAT_CUT] });
  addStaff('s-quarter', { categories: [CAT_NAILS] });
  const result = await matchStaff({ serviceIds: ['svc-cut', 'svc-color'], ...SLOT });
  assert.equal(result.partial, true);
  assert.equal(result.recommended, null);
  assert.equal(result.needed, 2);
  for (const entry of result.alternatives) {
    assert.equal(entry.coversAll, false);
    assert.ok(entry.coversCategories < result.needed);
  }
  assert.ok(result.alternatives.some((entry) => entry.coversCategories === 1));
});

test('none: no candidates at all', async () => {
  resetWorld();
  const result = await matchStaff({ serviceIds: ['svc-cut'], ...SLOT });
  assert.equal(result.recommended, null);
  assert.deepEqual(result.alternatives, []);
  assert.equal(result.partial, true);
});

test('tie: equal rating and bookings fall back to the stable id order', async () => {
  resetWorld();
  addStaff('s-b', { categories: [CAT_CUT], ratings: [4, 4, 4] });
  addStaff('s-a', { categories: [CAT_CUT], ratings: [4, 4, 4] });
  const result = await matchStaff({ serviceIds: ['svc-cut'], ...SLOT });
  assert.equal(result.recommended?.id, 's-a');
  assert.deepEqual(result.alternatives.map((entry) => entry.id), ['s-b']);
});

test('unavailable: staff busy at the slot is excluded', async () => {
  resetWorld();
  addStaff('s-busy', {
    categories: [CAT_CUT],
    ratings: [5, 5, 5],
    bookings: [{ date: SLOT.date, start: '09:30', end: '11:00' }],
  });
  addStaff('s-free', { categories: [CAT_CUT] });
  const result = await matchStaff({ serviceIds: ['svc-cut'], ...SLOT });
  assert.equal(result.recommended?.id, 's-free');
  assert.ok(!result.alternatives.some((entry) => entry.id === 's-busy'));
});

test('package spanning two genres requires both categories', async () => {
  resetWorld();
  addStaff('s-nails-only', { categories: [CAT_NAILS], ratings: [5, 5, 5] });
  addStaff('s-both', { categories: [CAT_CUT, CAT_NAILS] });
  const result = await matchStaff({ serviceIds: ['svc-cut', 'svc-nails'], ...SLOT });
  assert.equal(result.partial, false);
  assert.equal(result.recommended?.id, 's-both');
  assert.equal(result.alternatives.some((entry) => entry.id === 's-nails-only'), true);
  const nailsOnly = result.alternatives.find((entry) => entry.id === 's-nails-only');
  assert.equal(nailsOnly?.coversAll, false);
  assert.equal(nailsOnly?.coversCategories, 1);
});

test('fewer than 3 staff ratings ranks as neutral', async () => {
  resetWorld();
  addStaff('s-new', { categories: [CAT_CUT], ratings: [5] });
  addStaff('s-mid', { categories: [CAT_CUT], ratings: [3, 3, 3] });
  const result = await matchStaff({ serviceIds: ['svc-cut'], ...SLOT });
  const fresh = result.recommended;
  // s-new: 1 rating -> neutral (3.0); s-mid: 3 ratings -> 3.0; tie resolved by id.
  assert.equal(fresh?.avgStaffRating, null);
  assert.ok(NEUTRAL_RATING === 3.0);
  assert.ok(['s-mid', 's-new'].includes(String(fresh?.id)));
});
