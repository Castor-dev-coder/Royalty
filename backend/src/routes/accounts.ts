import { Router } from 'express';
import { getAccountController, listAccountsController, updateAccountStatusController, updateOwnProfileController, changePasswordController, adminChangePasswordController } from '../modules/accounts/accounts.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validator.js';
import { updateAccountStatusSchema, updateOwnProfileSchema, changePasswordSchema } from '../modules/accounts/accounts.schemas.js';

export const accountsRouter = Router();

// All routes require authentication
accountsRouter.use(authenticate);

// GET /accounts - List accounts (admin/manager only)
accountsRouter.get('/', requireRole('ADMIN', 'MANAGER'), listAccountsController);

// GET /accounts/:id - Get account by ID
accountsRouter.get('/:id', getAccountController);

// PATCH /accounts/me - Update own profile
accountsRouter.patch('/me', validateRequest(updateOwnProfileSchema), updateOwnProfileController);

// POST /accounts/me/password - Change own password
accountsRouter.post('/me/password', validateRequest(changePasswordSchema), changePasswordController);

// PATCH /accounts/:id/status - Update account status (admin/manager only)
accountsRouter.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), validateRequest(updateAccountStatusSchema), updateAccountStatusController);

// POST /accounts/:id/password - Admin change password for specific account (admin/manager only)
accountsRouter.post('/:id/password', requireRole('ADMIN', 'MANAGER'), validateRequest(changePasswordSchema), adminChangePasswordController);
