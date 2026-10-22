import { z } from 'zod';
import { personNameSchema, philippineMobileSchema } from '../../utils/validation.js';

// ============================================================
// Customer schemas
// ============================================================

export const createCustomerSchema = z.object({
  accountId: z.string().uuid(),
  firstName: personNameSchema(),
  lastName: personNameSchema(true),
  gender: z.string().max(30).optional(),
  phone: philippineMobileSchema(),
});

export type CreateCustomerRequest = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  firstName: personNameSchema().optional(),
  lastName: personNameSchema(true).optional(),
  gender: z.string().max(30).optional(),
  phone: philippineMobileSchema(),
});

export type UpdateCustomerRequest = z.infer<typeof updateCustomerSchema>;

export const customerResponseSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  gender: z.string().optional(),
  phone: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CustomerResponse = z.infer<typeof customerResponseSchema>;

export const customersListResponseSchema = z.object({
  customers: z.array(customerResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  totalPages: z.number().int().min(0),
});

export type CustomersListResponse = z.infer<typeof customersListResponseSchema>;
