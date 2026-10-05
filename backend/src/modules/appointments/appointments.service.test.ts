import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { StaffService } from '../staff/staff.service.js';

process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
const { AppointmentsService } = await import('./appointments.service.js');

test('calendar service combines duration, schedule, reservations, and studio timezone', async (context) => {
  const serviceId = '00000000-0000-4000-8000-000000000001';
  const eligibleStaff = [{ id: 'staff-1', firstName: 'Ari', lastName: 'Stylist', primaryRole: 'Stylist' }];
  const staffLookup = mock.method(StaffService, 'listEligibleForServices', async () => eligibleStaff);
  const serviceLookup = mock.method(db.orm.public.Service, 'where', () => ({
    first: async () => ({ isActive: true, durationMinutes: 60 }),
  }));
  const businessHours = mock.method(db.orm.public.BusinessHour, 'where', () => ({
    first: async () => ({ isOpen: true, openTime: '09:00', closeTime: '17:00' }),
  }));
  const schedules = mock.method(db.orm.public.StaffSchedule, 'where', () => ({
    all: async () => [{
      effectiveFrom: new Date('2099-01-01T00:00:00.000Z'), effectiveUntil: null,
      startTime: '09:00', endTime: '17:00',
    }],
  }));
  const appointments = mock.method(db.orm.public.Appointment, 'where', () => ({
    all: async () => [{ status: 'CONFIRMED', startTime: '12:00', endTime: '13:00' }],
  }));

  context.after(() => {
    staffLookup.mock.restore();
    serviceLookup.mock.restore();
    businessHours.mock.restore();
    schedules.mock.restore();
    appointments.mock.restore();
  });

  const result = await AppointmentsService.getCalendarAvailability({
    from: '2099-01-01', to: '2099-01-01', serviceIds: [serviceId],
  });
  assert.equal(result.timezone, 'Asia/Manila');
  assert.deepEqual(result.dates, [{
    date: '2099-01-01',
    staff: [{
      ...eligibleStaff[0],
      windows: [
        { startTime: '09:00', latestStartTime: '11:00' },
        { startTime: '13:00', latestStartTime: '16:00' },
      ],
    }],
  }]);
});

test('completed appointments include snapshots, safe staff, and review eligibility', async (context) => {
  const appointment = {
    id: 'appointment-1',
    appointmentCode: 'APT-COMPLETE',
    customerId: 'customer-1',
    staffId: 'staff-1',
    appointmentDate: new Date('2099-01-01T00:00:00.000Z'),
    startTime: '09:00',
    endTime: '10:00',
    totalAmount: '30.00',
    status: 'COMPLETED',
    createdAt: new Date('2098-12-01T00:00:00.000Z'),
    updatedAt: new Date('2099-01-01T10:00:00.000Z'),
  };
  const customerWhere = mock.method(db.orm.public.Customer, 'where', () => ({
    first: async () => ({ id: 'customer-1' }),
  }));
  const appointmentWhere = mock.method(db.orm.public.Appointment, 'where', () => ({
    count: async () => 1,
    orderBy: () => ({ skip: () => ({ take: () => ({ all: async () => [appointment] }) }) }),
  }) as unknown as ReturnType<typeof db.orm.public.Appointment.where>);
  const appointmentServicesWhere = mock.method(db.orm.public.AppointmentService, 'where', () => ({
    all: async () => [{
      id: 'line-1', serviceId: 'service-1', serviceName: 'Cut', price: '30.00', durationMinutes: 60,
    }],
  }));
  const staffWhere = mock.method(db.orm.public.Staff, 'where', () => ({
    first: async () => ({ id: 'staff-1', firstName: 'Alex', lastName: 'Stylist', primaryRole: 'Stylist' }),
  }));
  const reviewWhere = mock.method(db.orm.public.Review, 'where', () => ({ first: async () => null }));

  context.after(() => {
    customerWhere.mock.restore();
    appointmentWhere.mock.restore();
    appointmentServicesWhere.mock.restore();
    staffWhere.mock.restore();
    reviewWhere.mock.restore();
  });

  const result = await AppointmentsService.listCompletedMine('account-1', 1, 20);
  assert.equal(result.total, 1);
  assert.equal(result.appointments[0]?.appointmentCode, 'APT-COMPLETE');
  assert.equal(result.appointments[0]?.reviewEligible, true);
  assert.equal(result.appointments[0]?.alreadyReviewed, false);
  assert.equal(result.appointments[0]?.services[0]?.price, 30);
  assert.deepEqual(result.appointments[0]?.staff, {
    id: 'staff-1', firstName: 'Alex', lastName: 'Stylist', primaryRole: 'Stylist',
  });
});