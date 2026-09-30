import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateQuery, validateRequest } from '../middleware/validator.js';
import {
  appointmentAvailabilityQuerySchema,
  appointmentListQuerySchema,
  createAppointmentSchema,
  updateAppointmentStatusSchema,
} from '../modules/appointments/appointments.schemas.js';
import {
  createAppointmentController,
  getAppointmentAvailabilityController,
  getAppointmentController,
  listAppointmentsController,
  listMyAppointmentsController,
  listStaffAppointmentsController,
  updateAppointmentStatusController,
} from '../modules/appointments/appointments.controller.js';

export const appointmentsRouter = Router();

appointmentsRouter.use(authenticate);

appointmentsRouter.get('/availability', validateQuery(appointmentAvailabilityQuerySchema), getAppointmentAvailabilityController);
appointmentsRouter.get('/', requireRole('ADMIN', 'MANAGER'), validateQuery(appointmentListQuerySchema), listAppointmentsController);
appointmentsRouter.get('/me', requireRole('CUSTOMER', 'ADMIN', 'MANAGER'), validateQuery(appointmentListQuerySchema), listMyAppointmentsController);
appointmentsRouter.get('/staff/me', requireRole('STAFF'), validateQuery(appointmentListQuerySchema), listStaffAppointmentsController);
appointmentsRouter.post('/', requireRole('CUSTOMER'), validateRequest(createAppointmentSchema), createAppointmentController);
appointmentsRouter.patch('/:id/status', validateRequest(updateAppointmentStatusSchema), updateAppointmentStatusController);
appointmentsRouter.get('/:id', getAppointmentController);