import { z } from 'zod';

// ============================================================
// Auth schemas
// ============================================================

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER']).default('CUSTOMER'),
});

export type RegisterRequest = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;

// ============================================================
// Account schemas
// ============================================================

export const createAccountSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER']).default('CUSTOMER'),
});

export type CreateAccountRequest = z.infer<typeof createAccountSchema>;

export const updateAccountStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DEACTIVATED']),
});

export type UpdateAccountStatusRequest = z.infer<typeof updateAccountStatusSchema>;

// ============================================================
// Customer schemas
// ============================================================

export const createCustomerSchema = z.object({
  accountId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  gender: z.string().max(30).optional(),
  phone: z.string().max(30).optional(),
});

export type CreateCustomerRequest = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  gender: z.string().max(30).optional(),
  phone: z.string().max(30).optional(),
});

export type UpdateCustomerRequest = z.infer<typeof updateCustomerSchema>;

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

export const updateStaffSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).optional(),
  primaryRole: z.string().min(1).max(100).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME']).optional(),
  workStatus: z.enum(['ON_DUTY', 'DAY_OFF', 'UNAVAILABLE']).optional(),
});

export type UpdateStaffRequest = z.infer<typeof updateStaffSchema>;

// ============================================================
// Service catalog schemas
// ============================================================

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  isActive: z.boolean().default(true),
});

export type CreateCategoryRequest = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCategoryRequest = z.infer<typeof updateCategorySchema>;

export const createServiceSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(150),
  description: z.string().max(2000).optional(),
  price: z.number().min(0),
  durationMinutes: z.number().int().min(1),
  isActive: z.boolean().default(true),
});

export type CreateServiceRequest = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(2000).optional(),
  price: z.number().min(0).optional(),
  durationMinutes: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateServiceRequest = z.infer<typeof updateServiceSchema>;

export const assignServiceToStaffSchema = z.object({
  staffId: z.string().uuid(),
  serviceId: z.string().uuid(),
});

export type AssignServiceToStaffRequest = z.infer<typeof assignServiceToStaffSchema>;

// ============================================================
// Business hours schemas
// ============================================================

export const createBusinessHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  isOpen: z.boolean().default(true),
});

export type CreateBusinessHourRequest = z.infer<typeof createBusinessHourSchema>;

export const updateBusinessHourSchema = z.object({
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  isOpen: z.boolean().optional(),
});

export type UpdateBusinessHourRequest = z.infer<typeof updateBusinessHourSchema>;

// ============================================================
// Staff schedule schemas
// ============================================================

export const createStaffScheduleSchema = z.object({
  staffId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  effectiveFrom: z.string().date(),
  effectiveUntil: z.string().date().optional(),
  isActive: z.boolean().default(true),
});

export type CreateStaffScheduleRequest = z.infer<typeof createStaffScheduleSchema>;

export const updateStaffScheduleSchema = z.object({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  effectiveFrom: z.string().date().optional(),
  effectiveUntil: z.string().date().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateStaffScheduleRequest = z.infer<typeof updateStaffScheduleSchema>;

// ============================================================
// Schedule request schemas
// ============================================================

export const createScheduleRequestSchema = z.object({
  staffId: z.string().uuid(),
  requestedDate: z.string().date(),
  requestedStartTime: z.string().optional(),
  requestedEndTime: z.string().optional(),
  requestType: z.string().min(1).max(50),
  reason: z.string().max(1000).optional(),
});

export type CreateScheduleRequestRequest = z.infer<typeof createScheduleRequestSchema>;

export const updateScheduleRequestSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  reviewedBy: z.string().uuid().optional(),
});

export type UpdateScheduleRequestRequest = z.infer<typeof updateScheduleRequestSchema>;

// ============================================================
// Appointment schemas
// ============================================================

export const createAppointmentSchema = z.object({
  customerId: z.string().uuid(),
  appointmentDate: z.string().date(),
  startTime: z.string(),
  endTime: z.string(),
  services: z.array(z.object({
    serviceId: z.string().uuid(),
    serviceName: z.string().max(150),
    price: z.number().min(0),
    durationMinutes: z.number().int().min(1),
  })),
});

export type CreateAppointmentRequest = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(['RESERVED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
});

export type UpdateAppointmentStatusRequest = z.infer<typeof updateAppointmentStatusSchema>;

// ============================================================
// Payment schemas
// ============================================================

export const createPaymentSchema = z.object({
  appointmentId: z.string().uuid(),
  amount: z.number().min(0),
  paymentMethod: z.enum(['CASH', 'GCASH']),
  status: z.enum(['UNVERIFIED', 'VERIFIED', 'REJECTED']).default('UNVERIFIED'),
});

export type CreatePaymentRequest = z.infer<typeof createPaymentSchema>;

export const verifyPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  verifiedBy: z.string().uuid(),
});

export type VerifyPaymentRequest = z.infer<typeof verifyPaymentSchema>;

// ============================================================
// Review schemas
// ============================================================

export const createReviewSchema = z.object({
  appointmentId: z.string().uuid(),
  customerId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export type CreateReviewRequest = z.infer<typeof createReviewSchema>;

// ============================================================
// Pagination schemas
// ============================================================

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export type PaginationRequest = z.infer<typeof paginationSchema>;
