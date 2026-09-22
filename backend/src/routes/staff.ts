import { Router } from 'express';
import { getStaffController, getMyStaffController, listStaffController, createStaffController, updateOwnStaffController, updateStaffController } from '../modules/staff/staff.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validator.js';
import { createStaffSchema, updateOwnStaffProfileSchema, updateStaffEmploymentSchema } from '../modules/staff/staff.schemas.js';

export const staffRouter = Router();

// All routes require authentication
staffRouter.use(authenticate);

// GET /staff - List all staff (admin/manager only)
staffRouter.get('/', requireRole('ADMIN', 'MANAGER'), listStaffController);

// GET /staff/me - Get own staff profile
staffRouter.get('/me', getMyStaffController);

// GET /staff/:id - Get staff by ID
staffRouter.get('/:id', getStaffController);

// POST /staff - Create staff (admin/manager only)
staffRouter.post('/', requireRole('ADMIN', 'MANAGER'), validateRequest(createStaffSchema), createStaffController);

// PATCH /staff/me - Update own staff profile (phone only)
staffRouter.patch('/me', validateRequest(updateOwnStaffProfileSchema), updateOwnStaffController);

// PATCH /staff/:id - Update staff employment details (admin/manager only)
staffRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validateRequest(updateStaffEmploymentSchema), updateStaffController);
