import bcrypt from 'bcryptjs';
import { db } from '../../prisma/db.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../errors/index.js';
import { generateAuditLog } from '../../utils/audit.js';

export interface AccountProfile {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AccountService {
  /**
   * Get an account by ID.
   * - Authenticated users can view their own account
   * - ADMIN/MANAGER can view any account
   */
  static async getById(accountId: string, requestingUserId: string, requestingRole: string): Promise<AccountProfile> {
    const account = await db.orm.public.Account.where({ id: accountId }).first();
    if (!account) {
      throw new NotFoundError('Account not found');
    }

    // Users can only view their own account unless they are admin/manager
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER' && accountId !== requestingUserId) {
      throw new ForbiddenError('You do not have permission to view this account');
    }

    return {
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  /**
   * List accounts with pagination.
   * Only ADMIN/MANAGER can list accounts.
   * Uses database-level pagination via skip/take.
   */
  static async list(page: number, limit: number, requestingRole: string): Promise<{ accounts: AccountProfile[]; total: number }> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can list accounts');
    }

    // Clamp limit to a reasonable maximum (1-100)
    const clampedLimit = Math.max(1, Math.min(limit, 100));
    const skip = (page - 1) * clampedLimit;

    // Get total count
    const totalResult = await db.orm.public.Account.where({}).count();
    const total = typeof totalResult === 'number' ? totalResult : 0;

    // Get paginated results using database-level pagination.
    // Note: Prisma 8 RC11 supports skip/take at runtime but types may not fully reflect it.
    // The documented API is orderBy().skip(n).take(n).all() for PostgreSQL.
    const accountsRaw = db.orm.public.Account
      .orderBy((a) => a.createdAt.desc())
      // @ts-expect-error - Prisma 8 RC types don't expose skip on ordered Collection
      .skip(skip)
      .take(clampedLimit)
      .all();

    const accounts: AccountProfile[] = [];
    // Handle both AsyncIterable and array return types
    if (Array.isArray(accountsRaw)) {
      for (const account of accountsRaw) {
        accounts.push({
          id: account.id,
          email: account.email,
          role: account.role,
          status: account.status,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        });
      }
    } else {
      for await (const account of accountsRaw) {
        accounts.push({
          id: account.id,
          email: account.email,
          role: account.role,
          status: account.status,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        });
      }
    }

    return {
      accounts,
      total,
    };
  }

  /**
   * Update account status (ACTIVE/DEACTIVATED).
   * Only ADMIN/MANAGER can change status.
   */
  static async updateStatus(accountId: string, newStatus: string, requestingUserId: string): Promise<AccountProfile> {
    // Only admins/managers can change status
    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('You do not have permission to change account status');
    }

    const account = await db.orm.public.Account.where({ id: accountId }).first();
    if (!account) {
      throw new NotFoundError('Account not found');
    }

    // Cannot deactivate yourself if you're the only admin
    if (accountId === requestingUserId && newStatus === 'DEACTIVATED' && account.role === 'ADMIN') {
      const adminCountResult = await db.orm.public.Account
        .where({ role: 'ADMIN', status: 'ACTIVE' })
        .count();
      const adminCount = typeof adminCountResult === 'number' ? adminCountResult : 0;
      if (adminCount <= 1) {
        throw new BadRequestError('Cannot deactivate the only active admin account');
      }
    }

    const oldStatus = account.status;
    const updated = await db.orm.public.Account
      .where({ id: accountId })
      .update({
        status: newStatus as 'ACTIVE' | 'DEACTIVATED',
      });

    if (!updated) {
      throw new NotFoundError('Account not found');
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'UPDATE_STATUS',
      entityType: 'Account',
      entityId: accountId,
      oldData: { status: oldStatus },
      newData: { status: newStatus },
    });

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Update own profile (email only - password is separate).
   * Users can update their own email.
   */
  static async updateOwnProfile(accountId: string, newEmail: string): Promise<AccountProfile> {
    // Check if email is already taken by another account
    if (newEmail) {
      const existing = await db.orm.public.Account.where({ email: newEmail }).first();
      if (existing && existing.id !== accountId) {
        throw new ConflictError('This email is already in use by another account');
      }
    }

    const account = await db.orm.public.Account.where({ id: accountId }).first();
    if (!account) {
      throw new NotFoundError('Account not found');
    }

    const updateData: Record<string, unknown> = {};
    if (newEmail) {
      updateData.email = newEmail;
    }

    const updated = await db.orm.public.Account
      .where({ id: accountId })
      .update(updateData);

    if (!updated) {
      throw new NotFoundError('Account not found');
    }

    return {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Change password for an account.
   * Users can change their own password. ADMIN/MANAGER can change any password.
   */
  static async changePassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
    requestingUserId: string,
    requestingRole: string
  ): Promise<void> {
    const account = await db.orm.public.Account.where({ id: accountId }).first();
    if (!account) {
      throw new NotFoundError('Account not found');
    }

    // Verify current password if changing own password
    if (accountId === requestingUserId) {
      const valid = await bcrypt.compare(currentPassword, account.passwordHash);
      if (!valid) {
        throw new BadRequestError('Current password is incorrect');
      }
    } else if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('You do not have permission to change this account\'s password');
    }

    // Hash and update new password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.orm.public.Account
      .where({ id: accountId })
      .update({ passwordHash });

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'CHANGE_PASSWORD',
      entityType: 'Account',
      entityId: accountId,
      newData: { message: 'Password changed successfully' },
    });
  }
}
