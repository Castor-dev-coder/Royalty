import { Request, Response, NextFunction } from 'express';
import { AccountService } from './accounts.service.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { updateAccountStatusSchema, updateOwnProfileSchema, changePasswordSchema } from './accounts.schemas.js';
import { validateRequest } from '../../middleware/validator.js';

// GET /accounts/:id - Get account by ID
export async function getAccountController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const account = await AccountService.getById(
      id,
      req.user!.userId,
      req.user!.role
    );
    res.json({ data: account });
  } catch (error) {
    next(error);
  }
}

// GET /accounts - List accounts (admin only)
export async function listAccountsController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(String(req.query.page)) || 1;
    const limit = parseInt(String(req.query.limit)) || 20;

    const { accounts, total } = await AccountService.list(page, limit, req.user!.role);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: {
        accounts,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /accounts/:id/status - Update account status (admin only)
export async function updateAccountStatusController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    const account = await AccountService.updateStatus(id, String(status), req.user!.userId);
    res.json({ data: account });
  } catch (error) {
    next(error);
  }
}

// PATCH /accounts/me - Update own profile
export async function updateOwnProfileController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;

    const account = await AccountService.updateOwnProfile(req.user!.userId, email);
    res.json({ data: account });
  } catch (error) {
    next(error);
  }
}

// POST /accounts/me/password - Change own password
export async function changePasswordController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;

    await AccountService.changePassword(
      req.user!.userId,
      currentPassword,
      newPassword,
      req.user!.userId,
      req.user!.role
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
}

// POST /accounts/:id/password - Change password for specific account (admin only)
export async function adminChangePasswordController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const { currentPassword, newPassword } = req.body;

    // For admin changing another's password, currentPassword is not required
    // but we still accept it for validation consistency
    await AccountService.changePassword(
      id,
      String(currentPassword || ''),
      newPassword,
      req.user!.userId,
      req.user!.role
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
}
