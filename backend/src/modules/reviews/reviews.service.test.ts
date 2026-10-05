import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { ReviewsService } from './reviews.service.js';

test('review service uses the authenticated customer and returns safe appointment details', async (context) => {
  const appointmentId = '00000000-0000-4000-8000-000000000001';
  const customer = { id: 'customer-own' };
  const appointment = {
    id: appointmentId,
    customerId: customer.id,
    status: 'COMPLETED',
    appointmentCode: 'APT-TEST',
    appointmentDate: new Date('2099-01-01T00:00:00.000Z'),
    startTime: '09:00',
    endTime: '10:00',
    totalAmount: '25.00',
    staffId: null,
  };
  const customerWhere = mock.method(db.orm.public.Customer, 'where', () => ({ first: async () => customer }));
  const appointmentWhere = mock.method(db.orm.public.Appointment, 'where', () => ({ first: async () => appointment }));
  const reviewWhere = mock.method(db.orm.public.Review, 'where', () => ({ first: async () => null }));
  const reviewInputs: Array<{ appointmentId: string; customerId: string; rating: number; comment: string | null }> = [];
  const reviewCreate = mock.method(db.orm.public.Review, 'create', async (input: typeof reviewInputs[number]) => {
    reviewInputs.push(input);
    return { id: 'review-1', ...input, createdAt: new Date('2099-01-02T00:00:00.000Z') };
  });
  const appointmentServicesWhere = mock.method(db.orm.public.AppointmentService, 'where', () => ({ all: async () => [] }));

  context.after(() => {
    customerWhere.mock.restore();
    appointmentWhere.mock.restore();
    reviewWhere.mock.restore();
    reviewCreate.mock.restore();
    appointmentServicesWhere.mock.restore();
  });

  const result = await ReviewsService.create({ appointmentId, rating: 5 }, 'authenticated-account');
  assert.equal(reviewInputs[0]?.customerId, customer.id);
  assert.equal(reviewInputs[0]?.comment, null);
  assert.equal(result.appointment.appointmentCode, 'APT-TEST');
  assert.equal(result.appointment.totalAmount, 25);
  assert.equal('customerId' in result, false);
});