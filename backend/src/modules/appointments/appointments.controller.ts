import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { AppointmentsService } from './appointments.service.js';
import {
  AppointmentAvailabilityQuery,
  AppointmentListQuery,
  CreateAppointmentInput,
  UpdateAppointmentStatusInput,
} from './appointments.schemas.js';

function validated<T>(req: Request, key: 'validatedData' | 'validatedQuery'): T {
  return (req as Request & Record<typeof key, T>)[key];
}

export async function listAppointmentsController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = validated<AppointmentListQuery>(req, 'validatedQuery');
    const result = await AppointmentsService.listAll(page, limit);
    res.json({ data: { ...result, page, limit, totalPages: Math.ceil(result.total / limit) } });
  } catch (error) {
    next(error);
  }
}

export async function listMyAppointmentsController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = validated<AppointmentListQuery>(req, 'validatedQuery');
    const result = await AppointmentsService.listMine(req.user!.userId, req.user!.role, page, limit);
    res.json({ data: { ...result, page, limit, totalPages: Math.ceil(result.total / limit) } });
  } catch (error) {
    next(error);
  }
}

export async function listStaffAppointmentsController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = validated<AppointmentListQuery>(req, 'validatedQuery');
    const result = await AppointmentsService.listForStaff(req.user!.userId, page, limit);
    res.json({ data: { ...result, page, limit, totalPages: Math.ceil(result.total / limit) } });
  } catch (error) {
    next(error);
  }
}

export async function getAppointmentController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const appointment = await AppointmentsService.getById(String(req.params.id), req.user!.userId, req.user!.role);
    res.json({ data: { appointment } });
  } catch (error) {
    next(error);
  }
}

export async function getAppointmentAvailabilityController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = validated<AppointmentAvailabilityQuery>(req, 'validatedQuery');
    const availability = await AppointmentsService.checkAvailability(input);
    res.json({ data: availability });
  } catch (error) {
    next(error);
  }
}

export async function createAppointmentController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = validated<CreateAppointmentInput>(req, 'validatedData');
    const appointment = await AppointmentsService.create(input, req.user!.userId);
    res.status(201).json({ data: { appointment } });
  } catch (error) {
    next(error);
  }
}

export async function updateAppointmentStatusController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = validated<UpdateAppointmentStatusInput>(req, 'validatedData');
    const appointment = await AppointmentsService.updateStatus(
      String(req.params.id),
      input.status,
      req.user!.userId,
      req.user!.role
    );
    res.json({ data: { appointment } });
  } catch (error) {
    next(error);
  }
}