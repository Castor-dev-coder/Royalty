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
  getServicesForStaffController,
  assignStaffToServiceController,
  removeStaffFromServiceController,
} from '../modules/services/service.controller.js';
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
servicesRouter.use(authenticate);

// ============================================================
// Service Categories
// ============================================================

servicesRouter.get('/categories', requireRole('ADMIN', 'MANAGER'), listCategoriesController);
servicesRouter.get('/categories/:id', requireRole('ADMIN', 'MANAGER'), getCategoryController);
servicesRouter.post('/categories', requireRole('ADMIN', 'MANAGER'), validateRequest(createServiceCategorySchema), createCategoryController);
servicesRouter.patch('/categories/:id', requireRole('ADMIN', 'MANAGER'), validateRequest(updateServiceCategorySchema), updateCategoryController);

// ============================================================
// Services
// ============================================================

servicesRouter.get('/', requireRole('ADMIN', 'MANAGER'), listServicesController);
servicesRouter.get('/:id', requireRole('ADMIN', 'MANAGER'), getServiceController);
servicesRouter.post('/', requireRole('ADMIN', 'MANAGER'), validateRequest(createServiceSchema), createServiceController);
servicesRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validateRequest(updateServiceSchema), updateServiceController);

// ============================================================
// Staff-Service Assignments
// ============================================================

servicesRouter.get('/:id/staff', requireRole('ADMIN', 'MANAGER'), getStaffForServiceController);
servicesRouter.delete('/:id/staff/:staffId', requireRole('ADMIN', 'MANAGER'), validateRequest(removeStaffFromServiceSchema), removeStaffFromServiceController);
servicesRouter.post('/:id/assign', requireRole('ADMIN', 'MANAGER'), validateRequest(assignStaffToServiceSchema), assignStaffToServiceController);

// ============================================================
// Staff View (read-only for staff assigned to service)
// ============================================================

servicesRouter.get('/staff/:id/services', requireRole('ADMIN', 'MANAGER'), getServicesForStaffController);
