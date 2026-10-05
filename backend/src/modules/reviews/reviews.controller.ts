import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { ReviewsService } from './reviews.service.js';
import type { CreateReviewInput, ReviewListQuery } from './reviews.schemas.js';

export async function createReviewController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = (req as Request & { validatedData: CreateReviewInput }).validatedData;
    const review = await ReviewsService.create(input, req.user!.userId);
    res.status(201).json({ data: { review } });
  } catch (error) {
    next(error);
  }
}

export async function listReviewsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = (req as Request & { validatedQuery: ReviewListQuery }).validatedQuery;
    const result = await ReviewsService.list(query);
    res.json({
      data: {
        ...result,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(result.total / query.limit),
      },
    });
  } catch (error) {
    next(error);
  }
}