import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validator.js';
import {
  listCategoriesController,
  getCategoryController,
  createCategoryController,
  updateCategoryController,
  listServicesController,
  getServiceController,
  createServiceController,
  updateServiceController,
  getStaffForServiceController,
  getOwnServicesForStaffController,
  getServicesForStaffController,
  assignStaffToServiceController,
  removeStaffFromServiceController,
} from '../modules/services/service.controller.js';
import express from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { uploadServiceImageController } from '../modules/images/images.controller.js';
import {
  createServiceCategorySchema,
  updateServiceCategorySchema,
  createServiceSchema,
  updateServiceSchema,
  assignStaffToServiceSchema,
  removeStaffFromServiceSchema,
} from '../modules/services/service.schemas.js';

export const servicesRouter = Router();

// All routes require authentication
// Public browsing: the catalogue and categories need no sign-in.
servicesRouter.get('/categories', listCategoriesController);
servicesRouter.get('/categories/:id', getCategoryController);
servicesRouter.get('/', listServicesController);
servicesRouter.get('/:id', getServiceController);

servicesRouter.use(authenticate);

// ============================================================
// Service Categories
// ============================================================

servicesRouter.post('/categories', requireRole('ADMIN', 'MANAGER'), validateRequest(createServiceCategorySchema), createCategoryController);
servicesRouter.patch('/categories/:id', requireRole('ADMIN', 'MANAGER'), validateRequest(updateServiceCategorySchema), updateCategoryController);

// ============================================================
// Services
// ============================================================

servicesRouter.post('/', requireRole('ADMIN', 'MANAGER'), validateRequest(createServiceSchema), createServiceController);
servicesRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validateRequest(updateServiceSchema), updateServiceController);

// POST /services/:id/image - replace the service image (ADMIN/MANAGER,
// rate-limited, raw PNG/JPG body; magic bytes are checked server-side).
servicesRouter.post('/:id/image', requireRole('ADMIN', 'MANAGER'), rateLimit({ max: 10 }),
  express.raw({ type: ['image/png', 'image/jpeg'], limit: '10mb' }), uploadServiceImageController);

// ============================================================
// Staff-Service Assignments
// ============================================================

servicesRouter.get('/:id/staff', requireRole('ADMIN', 'MANAGER'), getStaffForServiceController);
servicesRouter.delete('/:id/staff/:staffId', requireRole('ADMIN', 'MANAGER'), validateRequest(removeStaffFromServiceSchema), removeStaffFromServiceController);
servicesRouter.post('/:id/assign', requireRole('ADMIN', 'MANAGER'), validateRequest(assignStaffToServiceSchema), assignStaffToServiceController);

// ============================================================
// Staff View (read-only for staff assigned to service)
// ============================================================

// The self-scoped route is registered before the parameterized one so that
// "/staff/me/services" is never captured as a staff row with the id "me".
servicesRouter.get('/staff/me/services', requireRole('STAFF', 'ADMIN', 'MANAGER'), getOwnServicesForStaffController);
servicesRouter.get('/staff/:id/services', requireRole('ADMIN', 'MANAGER'), getServicesForStaffController);
