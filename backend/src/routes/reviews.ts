import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateQuery, validateRequest } from '../middleware/validator.js';
import { createReviewController, listReviewsController } from '../modules/reviews/reviews.controller.js';
import { createReviewSchema, reviewListQuerySchema } from '../modules/reviews/reviews.schemas.js';

export const reviewsRouter = Router();

reviewsRouter.get('/', validateQuery(reviewListQuerySchema), listReviewsController);
reviewsRouter.post('/', authenticate, requireRole('CUSTOMER'), validateRequest(createReviewSchema), createReviewController);