import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validator.js';
import {
  getBusinessHoursController,
  replaceBusinessHoursController,
  getAllStaffSchedulesController,
  getStaffSchedulesByIdController,
  getMySchedulesController,
  createStaffScheduleController,
  updateStaffScheduleController,
  deleteStaffScheduleController,
  getAllScheduleRequestsController,
  getScheduleRequestByIdController,
  getMyScheduleRequestsController,
  createScheduleRequestController,
  approveScheduleRequestController,
  rejectScheduleRequestController,
} from '../modules/schedules/schedules.controller.js';
import {
  businessHoursWeekSchema,
  createStaffScheduleSchema,
  updateStaffScheduleSchema,
  createScheduleRequestSchema,
} from '../modules/schedules/schedules.schemas.js';

export const schedulesRouter = Router();

// All routes require authentication
schedulesRouter.use(authenticate);

// ============================================================
// Business Hours
// ============================================================

schedulesRouter.get('/business-hours', requireRole('ADMIN', 'MANAGER'), getBusinessHoursController);
schedulesRouter.patch('/business-hours', requireRole('ADMIN', 'MANAGER'), validateRequest(businessHoursWeekSchema), replaceBusinessHoursController);

// ============================================================
// Staff Schedules
// ============================================================

schedulesRouter.get('/staff', requireRole('ADMIN', 'MANAGER'), getAllStaffSchedulesController);
schedulesRouter.get('/staff/:id', getStaffSchedulesByIdController);
schedulesRouter.get('/staff/me', getMySchedulesController);
schedulesRouter.post('/staff', requireRole('ADMIN', 'MANAGER'), validateRequest(createStaffScheduleSchema), createStaffScheduleController);
schedulesRouter.patch('/staff/:id', requireRole('ADMIN', 'MANAGER'), validateRequest(updateStaffScheduleSchema), updateStaffScheduleController);
schedulesRouter.delete('/staff/:id', requireRole('ADMIN', 'MANAGER'), deleteStaffScheduleController);

// ============================================================
// Schedule Requests
// ============================================================

schedulesRouter.get('/requests', requireRole('ADMIN', 'MANAGER'), getAllScheduleRequestsController);
schedulesRouter.get('/requests/me', getMyScheduleRequestsController);
schedulesRouter.get('/requests/:id', getScheduleRequestByIdController);
schedulesRouter.post('/requests', validateRequest(createScheduleRequestSchema), createScheduleRequestController);
schedulesRouter.patch('/requests/:id/approve', requireRole('ADMIN', 'MANAGER'), approveScheduleRequestController);
schedulesRouter.patch('/requests/:id/reject', requireRole('ADMIN', 'MANAGER'), rejectScheduleRequestController);
