import { z } from 'zod';

// ============================================================
// Staff schemas
// ============================================================

export const createStaffSchema = z.object({
  accountId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  primaryRole: z.string().min(1).max(100),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME']),
  workStatus: z.enum(['ON_DUTY', 'DAY_OFF', 'UNAVAILABLE']).default('DAY_OFF'),
});

export type CreateStaffRequest = z.infer<typeof createStaffSchema>;

// Staff can update their own phone
export const updateOwnStaffProfileSchema = z.object({
  phone: z.string().max(30).optional(),
});

export type UpdateOwnStaffProfileRequest = z.infer<typeof updateOwnStaffProfileSchema>;

// Admin/Manager can update employment details
export const updateStaffEmploymentSchema = z.object({
  primaryRole: z.string().min(1).max(100).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME']).optional(),
  workStatus: z.enum(['ON_DUTY', 'DAY_OFF', 'UNAVAILABLE']).optional(),
});

export type UpdateStaffEmploymentRequest = z.infer<typeof updateStaffEmploymentSchema>;

// Combined update schema for admin/manager (all fields except accountId and sensitive fields)
export const updateStaffDetailsSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional(),
  primaryRole: z.string().min(1).max(100).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME']).optional(),
  workStatus: z.enum(['ON_DUTY', 'DAY_OFF', 'UNAVAILABLE']).optional(),
});

export type UpdateStaffDetailsRequest = z.infer<typeof updateStaffDetailsSchema>;

export const staffResponseSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  primaryRole: z.string(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME']),
  workStatus: z.enum(['ON_DUTY', 'DAY_OFF', 'UNAVAILABLE']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type StaffResponse = z.infer<typeof staffResponseSchema>;

export const staffListResponseSchema = z.object({
  staff: z.array(staffResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  totalPages: z.number().int().min(0),
});

export type StaffListResponse = z.infer<typeof staffListResponseSchema>;
