import { Request, Response, NextFunction } from 'express';
import { SchedulesService } from './schedules.service.js';
import { authenticate, requireRole, AuthenticatedRequest } from '../../middleware/auth.js';
import { businessHoursWeekSchema, createStaffScheduleSchema, updateStaffScheduleSchema, createScheduleRequestSchema } from './schedules.schemas.js';
import { validateRequest } from '../../middleware/validator.js';

// ============================================================
// Business Hours
// ============================================================

// GET /schedules/business-hours - List all business hours
export const getBusinessHoursController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const hours = await SchedulesService.getBusinessHours(req.user!.role);
    res.json({ data: { businessHours: hours } });
  } catch (error) {
    next(error);
  }
};

// PATCH /schedules/business-hours - Replace entire week
export const replaceBusinessHoursController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = businessHoursWeekSchema.parse(req.body);
    const hours = await SchedulesService.replaceBusinessHours(validated.days, req.user!.userId);
    res.json({ data: { businessHours: hours } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Staff Schedules
// ============================================================

// GET /schedules/staff - List all staff schedules
export const getAllStaffSchedulesController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schedules = await SchedulesService.getAllStaffSchedules(req.user!.role);
    res.json({ data: { staffSchedules: schedules } });
  } catch (error) {
    next(error);
  }
};

// GET /schedules/staff/:id - Get staff schedules by staff ID
export const getStaffSchedulesByIdController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const schedules = await SchedulesService.getStaffSchedulesById(id, req.user!.userId, req.user!.role);
    res.json({ data: { staffSchedules: schedules } });
  } catch (error) {
    next(error);
  }
};

// GET /schedules/staff/me - Get own schedules
export const getMySchedulesController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const schedules = await SchedulesService.getMySchedules(req.user!.userId);
    res.json({ data: { staffSchedules: schedules } });
  } catch (error) {
    next(error);
  }
};

// POST /schedules/staff - Create staff schedule
export const createStaffScheduleController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = createStaffScheduleSchema.parse(req.body);
    const schedule = await SchedulesService.createStaffSchedule(validated, req.user!.userId);
    res.status(201).json({ data: { staffSchedule: schedule } });
  } catch (error) {
    next(error);
  }
};

// PATCH /schedules/staff/:id - Update staff schedule
export const updateStaffScheduleController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = updateStaffScheduleSchema.parse(req.body);
    const id = String(req.params.id);
    const schedule = await SchedulesService.updateStaffSchedule(id, validated, req.user!.userId);
    res.json({ data: { staffSchedule: schedule } });
  } catch (error) {
    next(error);
  }
};

// DELETE /schedules/staff/:id - Delete staff schedule
export const deleteStaffScheduleController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await SchedulesService.deleteStaffSchedule(id, req.user!.userId);
    res.json({ data: { message: 'Staff schedule deleted successfully' } });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Schedule Requests
// ============================================================

// GET /schedules/requests - List all schedule requests
export const getAllScheduleRequestsController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const requests = await SchedulesService.getAllScheduleRequests(req.user!.role);
    res.json({ data: { scheduleRequests: requests } });
  } catch (error) {
    next(error);
  }
};

// GET /schedules/requests/:id - Get schedule request by ID
export const getScheduleRequestByIdController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const request = await SchedulesService.getScheduleRequestById(id, req.user!.userId, req.user!.role);
    res.json({ data: { scheduleRequest: request } });
  } catch (error) {
    next(error);
  }
};

// GET /schedules/requests/me - Get own schedule requests
export const getMyScheduleRequestsController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const requests = await SchedulesService.getMyScheduleRequests(req.user!.userId);
    res.json({ data: { scheduleRequests: requests } });
  } catch (error) {
    next(error);
  }
};

// POST /schedules/requests - Create schedule request
export const createScheduleRequestController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = createScheduleRequestSchema.parse(req.body);
    const request = await SchedulesService.createScheduleRequest(validated, req.user!.userId);
    res.status(201).json({ data: { scheduleRequest: request } });
  } catch (error) {
    next(error);
  }
};

// PATCH /schedules/requests/:id/approve - Approve request
export const approveScheduleRequestController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const request = await SchedulesService.approveScheduleRequest(id, req.user!.userId);
    res.json({ data: { scheduleRequest: request } });
  } catch (error) {
    next(error);
  }
};

// PATCH /schedules/requests/:id/reject - Reject request
export const rejectScheduleRequestController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const request = await SchedulesService.rejectScheduleRequest(id, req.user!.userId);
    res.json({ data: { scheduleRequest: request } });
  } catch (error) {
    next(error);
  }
};
