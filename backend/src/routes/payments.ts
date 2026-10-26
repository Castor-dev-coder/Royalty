import express, { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validateQuery, validateRequest } from '../middleware/validator.js';
import {
  getPaymentSettingsController,
  listMyPaymentsController,
  listPaymentsController,
  paymentActivityController,
  paymentQuoteController,
  recordInPersonPaymentController,
  submitOnlinePaymentController,
  updatePaymentSettingsController,
  updatePaymentStatusController,
  uploadGcashQrController,
} from '../modules/payments/payments.controller.js';
import {
  inPersonPaymentSchema,
  onlinePaymentSchema,
  paymentSettingsSchema,
  paymentStatusUpdateSchema,
} from '../modules/payments/payments.schemas.js';

export const paymentsRouter = Router();

// Public: the GCash QR display (image URL, receiver, masked number) and the
// configured down-payment policy. Never contains secrets.
paymentsRouter.get('/settings', getPaymentSettingsController);

paymentsRouter.use(authenticate);

// Server-calculated amounts for one appointment (owner customer + staff).
paymentsRouter.get('/quote/:appointmentId', paymentQuoteController);

// CUSTOMER: online GCash submission (proof image = raw body; 10 uploads/hour).
paymentsRouter.post(
  '/:appointmentId/online',
  requireRole('CUSTOMER'),
  rateLimit({ max: 10, windowMs: 60 * 60 * 1000 }),
  express.raw({ type: () => true, limit: '10mb' }),
  validateQuery(onlinePaymentSchema),
  submitOnlinePaymentController,
);

// STAFF/MANAGER/ADMIN: record money actually received at the salon.
paymentsRouter.post('/in-person', requireRole('STAFF', 'MANAGER', 'ADMIN'), validateRequest(inPersonPaymentSchema), recordInPersonPaymentController);

// ADMIN/MANAGER: verify or reject online proof (one-way, audited).
paymentsRouter.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), validateRequest(paymentStatusUpdateSchema), updatePaymentStatusController);

// Customer's own transactions.
paymentsRouter.get('/mine', listMyPaymentsController);

// ADMIN/MANAGER listings and activity (STAFF see their own appointments only).
paymentsRouter.get('/activity', requireRole('ADMIN', 'MANAGER', 'STAFF'), paymentActivityController);
paymentsRouter.get('/', requireRole('ADMIN', 'MANAGER', 'STAFF'), listPaymentsController);

// ADMIN: payment settings + QR upload.
paymentsRouter.put('/settings', requireRole('ADMIN'), validateRequest(paymentSettingsSchema), updatePaymentSettingsController);
paymentsRouter.post('/settings/qr', requireRole('ADMIN'), rateLimit({ max: 10, windowMs: 60 * 60 * 1000 }), express.raw({ type: () => true, limit: '10mb' }), uploadGcashQrController);
