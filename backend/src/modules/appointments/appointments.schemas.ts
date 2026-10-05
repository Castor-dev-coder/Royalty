import { z } from 'zod';
import { dateOnly } from './appointments.rules.js';

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM format');
const serviceIdsSchema = z.array(z.string().uuid()).min(1).max(10).refine(
  (ids) => new Set(ids).size === ids.length,
  'Duplicate service IDs are not allowed'
);

export const createAppointmentSchema = z.object({
  staffId: z.string().uuid(),
  appointmentDate: z.string().date(),
  startTime: timeSchema,
  serviceIds: serviceIdsSchema,
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(['RESERVED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
});

export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;

export const appointmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

export const appointmentAvailabilityQuerySchema = z.object({
  staffId: z.string().uuid(),
  appointmentDate: z.string().date(),
  startTime: timeSchema,
  serviceIds: z.string().transform((value) => value.split(',')).pipe(serviceIdsSchema),
});

export type AppointmentAvailabilityQuery = z.infer<typeof appointmentAvailabilityQuerySchema>;

export const calendarAvailabilityQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  staffId: z.string().uuid().optional(),
  serviceIds: z.string().transform((value) => value.split(',')).pipe(serviceIdsSchema),
}).superRefine(({ from, to }, context) => {
  const daysApart = (dateOnly(to).getTime() - dateOnly(from).getTime()) / (24 * 60 * 60 * 1000);
  if (daysApart < 0) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'End date must be on or after start date' });
  } else if (daysApart > 30) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'Date range cannot exceed 31 days' });
  }
});

export type CalendarAvailabilityQuery = z.infer<typeof calendarAvailabilityQuerySchema>;