import express, { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateQuery, validateRequest } from '../middleware/validator.js';
import { publicCacheMiddleware } from '../utils/http.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createReviewController, listReviewsController } from '../modules/reviews/reviews.controller.js';
import { setReviewPhotoHiddenController, uploadReviewPhotoController } from '../modules/reviews/photos.controller.js';
import { createReviewSchema, reviewListQuerySchema, setReviewPhotoHiddenSchema } from '../modules/reviews/reviews.schemas.js';

export const reviewsRouter = Router();

// Public gallery: safe to cache and revalidate.
reviewsRouter.get('/', publicCacheMiddleware, validateQuery(reviewListQuerySchema), listReviewsController);
// Photos: raw body (magic bytes decide the type); 10 uploads/hour/account.
reviewsRouter.post(
  '/:id/photos',
  authenticate,
  requireRole('CUSTOMER'),
  rateLimit({ max: 10, windowMs: 60 * 60 * 1000 }),
  express.raw({ type: () => true, limit: '10mb' }),
  uploadReviewPhotoController,
);
reviewsRouter.patch(
  '/:id/photos/:photoId',
  authenticate,
  requireRole('ADMIN', 'MANAGER'),
  validateRequest(setReviewPhotoHiddenSchema),
  setReviewPhotoHiddenController,
);
reviewsRouter.post('/', authenticate, requireRole('CUSTOMER'), validateRequest(createReviewSchema), createReviewController);