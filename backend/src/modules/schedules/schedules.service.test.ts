import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { createScheduleRequestSchema } from './schedules.schemas.js';
import { SchedulesService } from './schedules.service.js';

const staffAccountId = 'account-id';
const staffId = 'staff-profile-id';

test('business hour service reads PostgreSQL Sunday as ISO Sunday and normalizes time', async (context) => {
  const orderBy = mock.method(db.orm.public.BusinessHour, 'orderBy', () => ({
    all: async () => [{
      id: 'hours-id', dayOfWeek: 0, openTime: '09:00:00', closeTime: '17:00:00', isOpen: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }],
  }));
  context.after(() => orderBy.mock.restore());

  const hours = await SchedulesService.getBusinessHours('ADMIN');
  assert.equal(hours[0]?.dayOfWeek, 7);
  assert.equal(hours[0]?.openTime, '09:00');
  assert.equal(hours[0]?.closeTime, '17:00');
});

test('business hour replacement writes ISO weekdays as PostgreSQL weekdays', async (context) => {
  type TransactionCallback = Parameters<typeof db.transaction>[0];
  const inserted: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isOpen: boolean }> = [];
  const transactionContext = {
    orm: {
      public: {
        BusinessHour: {
          where: () => ({ delete: async () => undefined }),
          create: async (input: typeof inserted[number]) => {
            inserted.push(input);
            return { ...input, id: `business-${input.dayOfWeek}`, createdAt: new Date(), updatedAt: new Date() };
          },
        },
      },
    },
  };
  const transaction = mock.method(db, 'transaction', async (callback: TransactionCallback) =>
    callback(transactionContext as unknown as Parameters<TransactionCallback>[0]));
  const accountWhere = mock.method(db.orm.public.Account, 'where', () => ({
    first: async () => ({ id: staffAccountId, role: 'ADMIN' }),
  }));
  const orderBy = mock.method(db.orm.public.BusinessHour, 'orderBy', () => ({
    all: async () => inserted.map((row) => ({
      ...row,
      id: `business-${row.dayOfWeek}`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
  }));
  context.after(() => {
    transaction.mock.restore();
    accountWhere.mock.restore();
    orderBy.mock.restore();
  });

  const result = await SchedulesService.replaceBusinessHours(
    [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({ dayOfWeek, openTime: '09:00', closeTime: '17:00', isOpen: true })),
    staffAccountId
  );
  assert.deepEqual(inserted.map((day) => day.dayOfWeek), [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(result.map((day) => day.dayOfWeek), [1, 2, 3, 4, 5, 6, 7]);
});

test('staff schedule reads use the profile ID and convert database fields to API values', async (context) => {
  const queriedStaffIds: string[] = [];
  const staffWhere = mock.method(db.orm.public.Staff, 'where', (filter: { accountId?: string }) => ({
    first: async () => filter.accountId === staffAccountId ? { id: staffId } : null,
  }));
  const schedulesWhere = mock.method(db.orm.public.StaffSchedule, 'where', (filter: { staffId: string }) => {
    queriedStaffIds.push(filter.staffId);
    return { orderBy: () => ({ all: async () => [{
      id: 'schedule-id', staffId, dayOfWeek: 0, startTime: '09:00:00', endTime: '17:00:00',
      effectiveFrom: '2026-10-05', effectiveUntil: null, isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }] }) };
  });
  context.after(() => {
    staffWhere.mock.restore();
    schedulesWhere.mock.restore();
  });

  const result = await SchedulesService.getMySchedules(staffAccountId);
  assert.deepEqual(queriedStaffIds, [staffId]);
  assert.equal(result[0]?.dayOfWeek, 7);
  assert.equal(result[0]?.startTime, '09:00');
  assert.equal(result[0]?.effectiveFrom.toISOString(), '2026-10-05T00:00:00.000Z');
});

test('schedule conflict checks query PostgreSQL weekday values', async (context) => {
  let queriedDay = -1;
  const schedulesWhere = mock.method(db.orm.public.StaffSchedule, 'where', (filter: { dayOfWeek: number }) => {
    queriedDay = filter.dayOfWeek;
    return { all: async () => [] };
  });
  context.after(() => schedulesWhere.mock.restore());

  await SchedulesService.checkScheduleConflict(
    staffId, 7, '09:00', '10:00', new Date('2099-01-04T00:00:00.000Z'), null
  );
  assert.equal(queriedDay, 0);
});

test('staff schedule creation stores PostgreSQL weekday and Temporal date-only values', async (context) => {
  let inserted: { dayOfWeek: number; startTime: Temporal.PlainTime; effectiveFrom: Temporal.PlainDate; effectiveUntil: Temporal.PlainDate | null } | undefined;
  const accountWhere = mock.method(db.orm.public.Account, 'where', () => ({
    first: async () => ({ id: staffAccountId, role: 'ADMIN' }),
  }));
  const staffWhere = mock.method(db.orm.public.Staff, 'where', () => ({
    first: async () => ({ id: staffId, workStatus: 'ON_DUTY' }),
  }));
  const schedulesWhere = mock.method(db.orm.public.StaffSchedule, 'where', () => ({ all: async () => [] }));
  const schedule = {
    id: 'schedule-id', staffId, dayOfWeek: 0, startTime: '09:00:00', endTime: '17:00:00',
    effectiveFrom: new Date('2099-01-04T00:00:00.000Z'), effectiveUntil: null, isActive: true,
    createdAt: new Date('2099-01-01T00:00:00.000Z'), updatedAt: new Date('2099-01-01T00:00:00.000Z'),
  };
  const scheduleCreate = mock.method(db.orm.public.StaffSchedule, 'create', async (input: {
    staffId: string;
    dayOfWeek: number;
    startTime: Temporal.PlainTime;
    endTime: Temporal.PlainTime;
    effectiveFrom: Temporal.PlainDate;
    effectiveUntil: Temporal.PlainDate | null;
    isActive: boolean;
  }) => {
    inserted = input as unknown as typeof inserted;
    return schedule as never;
  });
  const auditCreate = mock.method(db.orm.public.AuditLog, 'create', async () => ({} as never));
  context.after(() => {
    accountWhere.mock.restore();
    staffWhere.mock.restore();
    schedulesWhere.mock.restore();
    scheduleCreate.mock.restore();
    auditCreate.mock.restore();
  });

  const result = await SchedulesService.createStaffSchedule({
    staffId,
    dayOfWeek: 7,
    startTime: '09:00',
    endTime: '17:00',
    effectiveFrom: '2099-01-04T15:30:00.000Z',
    isActive: true,
  }, staffAccountId);

  assert.equal(inserted?.dayOfWeek, 0);
  // `effective_from` is a PostgreSQL `date` column: the boundary receives a date-only string.
  assert.equal(inserted?.effectiveFrom.toString(), '2099-01-04');
  assert.equal(result.dayOfWeek, 7);
  assert.equal(result.startTime, '09:00');
  assert.equal(result.effectiveFrom.toISOString(), '2099-01-04T00:00:00.000Z');
});

test('staff schedule update converts the API weekday before writing', async (context) => {
  const schedule = {
    id: 'schedule-id', staffId, dayOfWeek: 0, startTime: '09:00:00', endTime: '17:00:00',
    effectiveFrom: new Date('2099-01-04T00:00:00.000Z'), effectiveUntil: null, isActive: false,
    createdAt: new Date('2099-01-01T00:00:00.000Z'), updatedAt: new Date('2099-01-01T00:00:00.000Z'),
  };
  let writtenDay = -1;
  const accountWhere = mock.method(db.orm.public.Account, 'where', () => ({
    first: async () => ({ id: staffAccountId, role: 'ADMIN' }),
  }));
  const schedulesWhere = mock.method(db.orm.public.StaffSchedule, 'where', (filter: { id?: string }) => {
    if (filter.id) return {
      first: async () => schedule,
      update: async (data: { dayOfWeek: number }) => {
        writtenDay = data.dayOfWeek;
        return { ...schedule, ...data };
      },
    };
    return { all: async () => [] };
  });
  const auditCreate = mock.method(db.orm.public.AuditLog, 'create', async () => ({} as never));
  context.after(() => {
    accountWhere.mock.restore();
    schedulesWhere.mock.restore();
    auditCreate.mock.restore();
  });

  const result = await SchedulesService.updateStaffSchedule('schedule-id', { dayOfWeek: 1 }, staffAccountId);
  assert.equal(writtenDay, 1);
  assert.equal(result.dayOfWeek, 1);
});

test('schedule request self-list queries by resolved staff profile ID', async (context) => {
  let queriedStaffId = '';
  const staffWhere = mock.method(db.orm.public.Staff, 'where', () => ({ first: async () => ({ id: staffId }) }));
  const requestWhere = mock.method(db.orm.public.ScheduleRequest, 'where', (filter: { staffId: string }) => {
    queriedStaffId = filter.staffId;
    return { orderBy: () => ({ all: async () => [] }) };
  });
  context.after(() => {
    staffWhere.mock.restore();
    requestWhere.mock.restore();
  });

  await SchedulesService.getMyScheduleRequests(staffAccountId);
  assert.equal(queriedStaffId, staffId);
});

test('schedule request creation stores a Temporal date and returns normalized time-only values', async (context) => {
  const requestInput: { staffId: string; requestedDate: Temporal.PlainDate; requestedStartTime: Temporal.PlainTime | null; requestedEndTime: Temporal.PlainTime | null }[] = [];
  const staffWhere = mock.method(db.orm.public.Staff, 'where', () => ({ first: async () => ({ id: staffId }) }));
  const requestCreate = mock.method(db.orm.public.ScheduleRequest, 'create', async (input: typeof requestInput[number]) => {
    requestInput.push(input);
    return {
      id: 'request-id', ...input, requestType: 'TIME_OFF', reason: null, status: 'PENDING',
      reviewedBy: null, reviewedAt: null, createdAt: new Date('2098-01-01T00:00:00.000Z'),
    };
  });
  const auditCreate = mock.method(db.orm.public.AuditLog, 'create', async () => ({} as never));
  context.after(() => {
    staffWhere.mock.restore();
    requestCreate.mock.restore();
    auditCreate.mock.restore();
  });

  const result = await SchedulesService.createScheduleRequest({
    requestedDate: '2099-01-05T15:30:00.000Z',
    requestedStartTime: '09:00',
    requestedEndTime: '10:00',
    requestType: 'TIME_OFF',
  }, staffAccountId);
  // `requested_date` is a PostgreSQL `date` column: the boundary receives a date-only string.
  assert.equal(requestInput[0]?.requestedDate.toString(), '2099-01-05');
  assert.equal(result.requestedDate.toISOString(), '2099-01-05T00:00:00.000Z');
  assert.equal(result.requestedStartTime, '09:00');
  assert.equal(result.requestedEndTime, '10:00');
});

test('schedule request creation keeps the calendar date a UTC-midnight timestamp names', async (context) => {
  const requestInput: { staffId: string; requestedDate: Temporal.PlainDate }[] = [];
  const staffWhere = mock.method(db.orm.public.Staff, 'where', () => ({ first: async () => ({ id: staffId }) }));
  const requestCreate = mock.method(db.orm.public.ScheduleRequest, 'create', async (input: typeof requestInput[number]) => {
    requestInput.push(input);
    return {
      id: 'request-id', ...input, requestType: 'TIME_OFF', reason: null, status: 'PENDING',
      reviewedBy: null, reviewedAt: null, createdAt: new Date('2098-01-01T00:00:00.000Z'),
    };
  });
  const auditCreate = mock.method(db.orm.public.AuditLog, 'create', async () => ({} as never));
  context.after(() => {
    staffWhere.mock.restore();
    requestCreate.mock.restore();
    auditCreate.mock.restore();
  });

  // A client that sends the chosen calendar date at UTC midnight must get that
  // same calendar date back, and the API must return it at UTC midnight so the
  // date does not shift when it is rendered in another timezone.
  const result = await SchedulesService.createScheduleRequest({
    requestedDate: '2099-01-05T00:00:00.000Z',
    requestType: 'TIME_OFF',
  }, staffAccountId);
  assert.equal(requestInput[0]?.requestedDate.toString(), '2099-01-05');
  assert.equal(result.requestedDate.toISOString(), '2099-01-05T00:00:00.000Z');
});

test('the admin schedule-request list carries the requester identity, resolved on the server', async (context) => {
  const requestRows = [
    {
      id: 'request-a', staffId: 'staff-a', requestedDate: new Date('2026-10-01T00:00:00.000Z'),
      requestedStartTime: '09:00:00', requestedEndTime: '17:00:00', requestType: 'TIME_OFF',
      reason: 'Family day', status: 'PENDING', reviewedBy: null, reviewedAt: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
    },
    {
      id: 'request-b', staffId: 'staff-b', requestedDate: new Date('2026-10-02T00:00:00.000Z'),
      requestedStartTime: null, requestedEndTime: null, requestType: 'AVAILABILITY',
      reason: null, status: 'APPROVED', reviewedBy: 'admin-id', reviewedAt: new Date('2026-10-02T00:00:00.000Z'),
      createdAt: new Date('2026-10-02T00:00:00.000Z'),
    },
  ];
  const orderBy = mock.method(db.orm.public.ScheduleRequest, 'orderBy', () => ({ all: async () => requestRows }));
  const staffWhere = mock.method(db.orm.public.Staff, 'where', (filter: { id: string }) => ({
    first: async () => {
      if (filter.id === 'staff-a') return { id: 'staff-a', accountId: 'account-a', firstName: 'Elena', lastName: 'Morales' };
      if (filter.id === 'staff-b') return { id: 'staff-b', accountId: 'account-b', firstName: 'Marco', lastName: 'Villanueva' };
      return null;
    },
  }));
  const accountWhere = mock.method(db.orm.public.Account, 'where', (filter: { id: string }) => ({
    first: async () => {
      if (filter.id === 'account-a') return { id: 'account-a', email: 'elena.morales@example.test' };
      if (filter.id === 'account-b') return { id: 'account-b', email: 'marco.villanueva@example.test' };
      return null;
    },
  }));
  context.after(() => {
    orderBy.mock.restore();
    staffWhere.mock.restore();
    accountWhere.mock.restore();
  });

  const requests = await SchedulesService.getAllScheduleRequests('ADMIN');

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.requesterName, 'Elena Morales');
  assert.equal(requests[0]?.requesterEmail, 'elena.morales@example.test');
  assert.equal(requests[1]?.requesterName, 'Marco Villanueva');
  assert.equal(requests[1]?.requesterEmail, 'marco.villanueva@example.test');
});

test('a schedule request whose staff profile is gone still lists, with no requester', async (context) => {
  const orderBy = mock.method(db.orm.public.ScheduleRequest, 'orderBy', () => ({ all: async () => [{
    id: 'request-orphan', staffId: 'staff-gone', requestedDate: new Date('2026-10-01T00:00:00.000Z'),
    requestedStartTime: null, requestedEndTime: null, requestType: 'TIME_OFF',
    reason: null, status: 'PENDING', reviewedBy: null, reviewedAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
  }] }));
  const staffWhere = mock.method(db.orm.public.Staff, 'where', () => ({ first: async () => null }));
  context.after(() => {
    orderBy.mock.restore();
    staffWhere.mock.restore();
  });

  const requests = await SchedulesService.getAllScheduleRequests('ADMIN');
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.requesterName, null);
  assert.equal(requests[0]?.requesterEmail, null);
});

test('a staff member cannot read another staff member schedule requests', async (context) => {
  const staffWhere = mock.method(db.orm.public.Staff, 'where', () => ({ first: async () => ({ id: staffId }) }));
  const requestWhere = mock.method(db.orm.public.ScheduleRequest, 'where', (filter: { staffId: string }) => {
    assert.equal(filter.staffId, staffId);
    return { orderBy: () => ({ all: async () => [] }) };
  });
  context.after(() => {
    staffWhere.mock.restore();
    requestWhere.mock.restore();
  });

  await SchedulesService.getMyScheduleRequests(staffAccountId);
  await assert.rejects(
    () => SchedulesService.getAllScheduleRequests('STAFF'),
    /Viewing schedule requests requires an administrator or manager account/,
  );
});

test('a forged staff ID in the request body is discarded, and the session decides the owner', async (context) => {
  const requestInput: { staffId: string }[] = [];
  const staffWhere = mock.method(db.orm.public.Staff, 'where', () => ({ first: async () => ({ id: staffId, accountId: staffAccountId, firstName: 'Elena', lastName: 'Morales' }) }));
  const requestCreate = mock.method(db.orm.public.ScheduleRequest, 'create', async (input: typeof requestInput[number]) => {
    requestInput.push(input);
    return {
      id: 'request-id', ...input, requestType: 'TIME_OFF', reason: null, status: 'PENDING',
      reviewedBy: null, reviewedAt: null, createdAt: new Date('2098-01-01T00:00:00.000Z'),
    };
  });
  const accountWhere = mock.method(db.orm.public.Account, 'where', () => ({ first: async () => ({ id: staffAccountId, email: 'elena.morales@example.test' }) }));
  const auditCreate = mock.method(db.orm.public.AuditLog, 'create', async () => ({} as never));
  context.after(() => {
    staffWhere.mock.restore();
    requestCreate.mock.restore();
    accountWhere.mock.restore();
    auditCreate.mock.restore();
  });

  // The client sends a staff ID of its own. The schema strips it, because
  // only the session may say who the request belongs to.
  const parsed = createScheduleRequestSchema.parse({
    requestedDate: '2099-01-05T00:00:00.000Z',
    requestType: 'TIME_OFF',
    staffId: 'somebody-elses-staff-id',
  });
  assert.equal('staffId' in parsed, false);

  const result = await SchedulesService.createScheduleRequest(parsed, staffAccountId);

  // The stored owner is the authenticated account's own staff profile.
  assert.equal(requestInput[0]?.staffId, staffId);
  assert.equal(result.requesterName, 'Elena Morales');
  assert.equal(result.requesterEmail, 'elena.morales@example.test');
});
