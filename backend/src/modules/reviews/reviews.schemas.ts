import { z } from 'zod';

export const categoryRatingsSchema = z
  .object({
    service: z.number().int().min(1).max(5),
    products: z.number().int().min(1).max(5),
    staff: z.number().int().min(1).max(5),
    timeManagement: z.number().int().min(1).max(5),
  })
  .strict();

export const createReviewSchema = z
  .object({
    appointmentId: z.string().uuid(),
    ratings: categoryRatingsSchema,
    comment: z.string().max(2000).optional(),
  })
  .strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const setReviewPhotoHiddenSchema = z.object({
  hidden: z.boolean(),
});

export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;