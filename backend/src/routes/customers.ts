import { Router } from 'express';
import { getCustomerController, getMyCustomerController, listCustomersController, createCustomerController, updateCustomerController } from '../modules/customers/customers.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validator.js';
import { createCustomerSchema, updateCustomerSchema } from '../modules/customers/customers.schemas.js';

export const customersRouter = Router();

// All routes require authentication
customersRouter.use(authenticate);

// GET /customers - List all customers (admin/manager only)
customersRouter.get('/', requireRole('ADMIN', 'MANAGER'), listCustomersController);

// GET /customers/me - Get own customer profile
customersRouter.get('/me', getMyCustomerController);

// GET /customers/:id - Get customer by ID
customersRouter.get('/:id', getCustomerController);

// POST /customers - Create customer (admin/manager only)
customersRouter.post('/', requireRole('ADMIN', 'MANAGER'), validateRequest(createCustomerSchema), createCustomerController);

// PATCH /customers/:id - Update customer
customersRouter.patch('/:id', validateRequest(updateCustomerSchema), updateCustomerController);
