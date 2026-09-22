import { z } from 'zod';

// ============================================================
// Business Hours Schemas
// ============================================================

// Single day business hours input
export const businessHourDaySchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  isOpen: z.boolean(),
});

export type BusinessHourDayInput = z.infer<typeof businessHourDaySchema>;

// Full week business hours (7 days)
export const businessHoursWeekSchema = z.object({
  days: z.array(businessHourDaySchema).min(7).max(7),
}).refine(
  (data) => {
    // Check no duplicate dayOfWeek values
    const days = data.days.map((d) => d.dayOfWeek);
    const uniqueDays = new Set(days);
    return days.length === uniqueDays.size;
  },
  { message: 'Duplicate dayOfWeek values are not allowed' }
);

export type BusinessHoursWeekInput = z.infer<typeof businessHoursWeekSchema>;

// ============================================================
// Staff Schedule Schemas
// ============================================================

// Create staff schedule
export const createStaffScheduleSchema = z.object({
  staffId: z.string().uuid(),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  effectiveFrom: z.string().datetime(),
  effectiveUntil: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
});

export type CreateStaffScheduleInput = z.infer<typeof createStaffScheduleSchema>;

// Update staff schedule
export const updateStaffScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveUntil: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});

export type UpdateStaffScheduleInput = z.infer<typeof updateStaffScheduleSchema>;

// Staff schedule response
export const staffScheduleResponseSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  dayOfWeek: z.number().int(),
  startTime: z.string(),
  endTime: z.string(),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type StaffScheduleResponse = z.infer<typeof staffScheduleResponseSchema>;

// ============================================================
// Schedule Request Schemas
// ============================================================

// Create schedule request (staff only)
export const createScheduleRequestSchema = z.object({
  requestedDate: z.string().datetime(),
  requestedStartTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  requestedEndTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  requestType: z.string().min(1).max(20),
  reason: z.string().max(500).optional(),
});

export type CreateScheduleRequestInput = z.infer<typeof createScheduleRequestSchema>;

// Approve/reject request
export const reviewScheduleRequestSchema = z.object({
  // No additional fields needed - just the action
});

// Schedule request response
export const scheduleRequestResponseSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  requestedDate: z.string(),
  requestedStartTime: z.string().nullable(),
  requestedEndTime: z.string().nullable(),
  requestType: z.string(),
  reason: z.string().nullable(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ScheduleRequestResponse = z.infer<typeof scheduleRequestResponseSchema>;

// ============================================================
// List/response wrapping schemas
// ============================================================

export const businessHoursResponseSchema = z.object({
  id: z.string().uuid(),
  dayOfWeek: z.number().int(),
  openTime: z.string(),
  closeTime: z.string(),
  isOpen: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BusinessHoursResponse = z.infer<typeof businessHoursResponseSchema>;
