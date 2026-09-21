import { z } from 'zod';

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

export const updateOwnProfileSchema = z.object({
  email: z.string().email().max(255).optional(),
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
