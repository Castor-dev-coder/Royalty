import { Router } from 'express';
import { getStaffController, getMyStaffController, listStaffController, createStaffController, updateOwnStaffController, updateStaffController, listEligibleStaffController } from '../modules/staff/staff.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateQuery, validateRequest } from '../middleware/validator.js';
import { createStaffSchema, eligibleStaffQuerySchema, updateOwnStaffProfileSchema, updateStaffDetailsSchema } from '../modules/staff/staff.schemas.js';
import { listTeamController } from '../modules/staff/team.controller.js';
import express from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { uploadStaffPhotoController } from '../modules/images/images.controller.js';

export const staffRouter = Router();

// All routes require authentication
// Public team listing for "Meet Our Team" — no sign-in, display fields only.
staffRouter.get('/team', listTeamController);

staffRouter.use(authenticate);

// Customer-facing booking discovery; appointment creation rechecks eligibility.
staffRouter.get('/eligible', requireRole('CUSTOMER'), validateQuery(eligibleStaffQuerySchema), listEligibleStaffController);

// GET /staff - List all staff (admin/manager only)
staffRouter.get('/', requireRole('ADMIN', 'MANAGER'), listStaffController);

// POST /staff/:id/photo - replace a staff photo (ADMIN/MANAGER, rate-limited,
// raw PNG/JPG body; magic bytes are checked server-side).
staffRouter.post('/:id/photo', requireRole('ADMIN', 'MANAGER'), rateLimit({ max: 10 }),
  express.raw({ type: ['image/png', 'image/jpeg'], limit: '10mb' }), uploadStaffPhotoController);

// GET /staff/me - Get own staff profile
staffRouter.get('/me', getMyStaffController);

// GET /staff/:id - Get staff by ID
staffRouter.get('/:id', getStaffController);

// POST /staff - Create staff (admin/manager only)
staffRouter.post('/', requireRole('ADMIN', 'MANAGER'), validateRequest(createStaffSchema), createStaffController);

// PATCH /staff/me - Update own staff profile (phone only)
staffRouter.patch('/me', validateRequest(updateOwnStaffProfileSchema), updateOwnStaffController);

// PATCH /staff/:id - Update staff details (admin/manager only)
// The details schema covers every field the service applies. The employment-only
// schema stripped firstName/lastName/phone even though the controller and the
// service both write them, so those edits were silently discarded.
staffRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validateRequest(updateStaffDetailsSchema), updateStaffController);
