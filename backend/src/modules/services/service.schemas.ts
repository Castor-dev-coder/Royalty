import { z } from 'zod';
import { amountSchema, durationMinutesSchema, freeTextSchema } from '../../utils/validation.js';

// ============================================================
// Service schemas
// ============================================================

// Create service category schema
export const createServiceCategorySchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateServiceCategoryRequest = z.infer<typeof createServiceCategorySchema>;

// Update service category schema
export const updateServiceCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateServiceCategoryRequest = z.infer<typeof updateServiceCategorySchema>;

// Create service schema
export const createServiceSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: freeTextSchema(500).optional(),
  price: amountSchema(),
  durationMinutes: durationMinutesSchema(),
});

export type CreateServiceRequest = z.infer<typeof createServiceSchema>;

// Update service schema (admin can update any field)
export const updateServiceSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: freeTextSchema(500).nullable().optional(),
  price: amountSchema().optional(),
  durationMinutes: durationMinutesSchema().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateServiceRequest = z.infer<typeof updateServiceSchema>;

// Assign staff to service schema
export const assignStaffToServiceSchema = z.object({
  staffIds: z.array(z.string().uuid()).min(1),
});

export type AssignStaffToServiceRequest = z.infer<typeof assignStaffToServiceSchema>;

// Remove staff from service schema
export const removeStaffFromServiceSchema = z.object({
  staffId: z.string().uuid(),
});

export type RemoveStaffFromServiceRequest = z.infer<typeof removeStaffFromServiceSchema>;

// Service response schema
export const serviceCategoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ServiceCategoryResponse = z.infer<typeof serviceCategoryResponseSchema>;

// Service response schema
export const serviceResponseSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  durationMinutes: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ServiceResponse = z.infer<typeof serviceResponseSchema>;

// Combined service with category info
export const serviceWithCategoryResponseSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  durationMinutes: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ServiceWithCategoryResponse = z.infer<typeof serviceWithCategoryResponseSchema>;
