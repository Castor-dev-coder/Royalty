import { z } from 'zod';
import { emailSchema, gmailSchema } from '../../utils/validation.js';

// ============================================================
// Account schemas
// ============================================================

export const createAccountSchema = z.object({
  // A new account is given a Gmail address.
  email: gmailSchema(),
  password: z.string().min(8).max(100),
  // ADMIN is deliberately absent: no creation path may mint an administrator
  // (hidden-admin prevention). Staff/Manager accounts go through the dedicated
  // staff-account creation contract instead.
  role: z.enum(['MANAGER', 'STAFF', 'CUSTOMER']).default('CUSTOMER'),
});

export type CreateAccountRequest = z.infer<typeof createAccountSchema>;

export const updateAccountStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DEACTIVATED']),
});

export type UpdateAccountStatusRequest = z.infer<typeof updateAccountStatusSchema>;

// Role change is ADMIN-only (requireRole('ADMIN') on the route, re-checked
// against the stored account in the service). Unknown fields in the payload
// are stripped by the object schema, so a smuggled role in any other update
// never reaches a service.
export const updateAccountRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER']),
});

export type UpdateAccountRoleRequest = z.infer<typeof updateAccountRoleSchema>;

export const updateOwnProfileSchema = z.object({
  // The address is checked for shape here. Whether it has to be a Gmail
  // address depends on whether it is the one the account already has, and
  // only the service knows that, so the rule lives there.
  email: emailSchema().optional(),
  // Password is handled separately via change-password endpoint
});

export type UpdateOwnProfileRequest = z.infer<typeof updateOwnProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

export const accountResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER']),
  status: z.enum(['ACTIVE', 'DEACTIVATED']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AccountResponse = z.infer<typeof accountResponseSchema>;

export const accountsListResponseSchema = z.object({
  accounts: z.array(accountResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  totalPages: z.number().int().min(0),
});

export type AccountsListResponse = z.infer<typeof accountsListResponseSchema>;

// Staff/Manager account creation. ADMIN is deliberately NOT in the enum: no
// API or UI path creates an ADMIN here (the hidden system admin is provisioned
// only by the one-off backend script).
export const createStaffAccountSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  role: z.enum(['STAFF', 'MANAGER']),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  position: z.string().min(1).max(100).optional(),
  bio: z.string().max(2000).optional(),
  coveredRoles: z.array(z.string().min(1).max(100)).max(10).optional(),
  showOnTeam: z.boolean().optional(),
  specialties: z.array(z.string().uuid()).max(20).optional(),
});

export type CreateStaffAccountRequest = z.infer<typeof createStaffAccountSchema>;
