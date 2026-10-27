import bcrypt from 'bcryptjs';
import { db } from '../../prisma/db.js';
import { pgVarchar } from '../../prisma/contract-compat.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../errors/index.js';
import { generateAuditLog } from '../../utils/audit.js';
import { GMAIL_MESSAGE, isValidGmail } from '../../utils/validation.js';

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
    // Hidden system account: 404 for everyone, including other admins. It
    // still signs in and uses /api/me — it simply has no fetchable ID.
    if (account.isSystem) {
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
    const totalResult = await db.orm.public.Account
      .where({ isSystem: false })
      .aggregate((aggregate) => ({ total: aggregate.count() }));
    const total = typeof totalResult.total === 'number' ? totalResult.total : 0;

    // Get paginated results using database-level pagination.
    const accountsRaw = db.orm.public.Account
      .where({ isSystem: false })
      .orderBy((a) => a.createdAt.desc())
      .offset(skip)
      .limit(clampedLimit)
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
   * Change an account's role (promote or demote).
   * Only ADMIN may write roles — enforced at the route (requireRole('ADMIN'))
   * and re-checked here against the stored account, never the JWT claim alone.
   * MANAGER/STAFF/CUSTOMER attempts are rejected 403.
   */
  static async updateRole(
    accountId: string,
    newRole: 'ADMIN' | 'MANAGER' | 'STAFF' | 'CUSTOMER',
    requestingUserId: string
  ): Promise<AccountProfile> {
    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || requester.role !== 'ADMIN') {
      throw new ForbiddenError('Only administrators can change account roles');
    }

    const account = await db.orm.public.Account.where({ id: accountId }).first();
    if (!account) {
      throw new NotFoundError('Account not found');
    }
    // Hidden system account: no by-ID role change for anyone.
    if (account.isSystem) {
      throw new NotFoundError('Account not found');
    }

    if (account.role === newRole) {
      return {
        id: account.id,
        email: account.email,
        role: account.role,
        status: account.status,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      };
    }

    // Demoting the last visible active admin would leave the system with no
    // usable administrator (the hidden one cannot satisfy admin workflows).
    if (account.role === 'ADMIN' && newRole !== 'ADMIN') {
      const adminCountResult = await db.orm.public.Account
        .where({ role: 'ADMIN', status: 'ACTIVE', isSystem: false })
        .aggregate((aggregate) => ({ total: aggregate.count() }));
      const adminCount = typeof adminCountResult.total === 'number' ? adminCountResult.total : 0;
      if (adminCount <= 1) {
        throw new BadRequestError('Cannot change the role of the only active admin account');
      }
    }

    const oldRole = account.role;
    const updated = await db.orm.public.Account
      .where({ id: accountId })
      .update({ role: newRole });
    if (!updated) {
      throw new NotFoundError('Account not found');
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'UPDATE_ACCOUNT_ROLE',
      entityType: 'Account',
      entityId: accountId,
      oldData: { role: oldRole },
      newData: { role: newRole },
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
    // Hidden system account: no by-ID status change for anyone.
    if (account.isSystem) {
      throw new NotFoundError('Account not found');
    }

    // Cannot deactivate yourself if you're the only admin
    if (accountId === requestingUserId && newStatus === 'DEACTIVATED' && account.role === 'ADMIN') {
      const adminCountResult = await db.orm.public.Account
        .where({ role: 'ADMIN', status: 'ACTIVE', isSystem: false })
        .aggregate((aggregate) => ({ total: aggregate.count() }));
      const adminCount = typeof adminCountResult.total === 'number' ? adminCountResult.total : 0;
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
    const account = await db.orm.public.Account.where({ id: accountId }).first();
    if (!account) {
      throw new NotFoundError('Account not found');
    }

    const updateData: Record<string, unknown> = {};
    if (newEmail) {
      // An address that is being set for the first time has to be a Gmail
      // address. An address the account already has is left alone, so an
      // account on another domain is never asked to change it and can
      // still be saved.
      const current = String(account.email ?? '').trim().toLowerCase();
      const next = newEmail.trim().toLowerCase();
      if (next !== current && !isValidGmail(newEmail)) {
        throw new BadRequestError(GMAIL_MESSAGE);
      }

      // Check if email is already taken by another account
      const existing = await db.orm.public.Account.where({ email: pgVarchar<255>(newEmail) }).first();
      if (existing && existing.id !== accountId) {
        throw new ConflictError('This email is already in use by another account');
      }

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
    // By-ID password reset on the hidden system account: 404 for everyone.
    // (The system admin can still rotate its own password through /accounts/me.)
    if (account.isSystem && accountId !== requestingUserId) {
      throw new NotFoundError('Account not found');
    }

    // Verify current password if changing own password
    if (accountId === requestingUserId) {
      if (!account.passwordHash) {
        throw new BadRequestError('Current password is incorrect');
      }
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

  /**
   * Create a STAFF or MANAGER account together with its staff profile.
   * ADMIN is never creatable here (400); the requester must be ADMIN/MANAGER.
   */
  static async createStaffAccount(data: {
    email: string;
    password: string;
    role: 'STAFF' | 'MANAGER';
    firstName: string;
    lastName: string;
    phone?: string;
    position?: string;
    bio?: string;
    coveredRoles?: string[];
    showOnTeam?: boolean;
    specialties?: string[];
  }, requestingUserId: string): Promise<{ accountId: string; staffId: string }> {
    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('You do not have permission to create accounts');
    }
    if (data.role !== 'STAFF' && data.role !== 'MANAGER') {
      throw new BadRequestError('Only STAFF and MANAGER accounts can be created here');
    }
    const existing = await db.orm.public.Account.where({ email: pgVarchar<255>(data.email) }).first();
    if (existing) {
      throw new ConflictError('An account with that email already exists');
    }
    const specialties = data.specialties ?? [];
    if (data.showOnTeam && specialties.length === 0) {
      throw new BadRequestError('A team member needs at least one specialty');
    }
    for (const categoryId of specialties) {
      const category = await db.orm.public.ServiceCategory.where({ id: categoryId }).first();
      if (!category) throw new BadRequestError(`Unknown category: ${categoryId}`);
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const account = await db.orm.public.Account.create({
      email: pgVarchar<255>(data.email),
      passwordHash,
      role: data.role,
      status: 'ACTIVE',
      isSystem: false,
    });
    const staff = await db.orm.public.Staff.create({
      accountId: account.id,
      firstName: pgVarchar<100>(data.firstName),
      lastName: pgVarchar<100>(data.lastName),
      phone: data.phone ? pgVarchar<30>(data.phone) : null,
      primaryRole: pgVarchar<100>(data.role === 'MANAGER' ? 'Manager' : 'Stylist'),
      employmentType: 'FULL_TIME',
      workStatus: 'DAY_OFF',
      position: data.position ? pgVarchar<100>(data.position) : null,
      bio: data.bio ?? null,
      coveredRoles: data.coveredRoles ?? [],
      showOnTeam: data.showOnTeam ?? false,
    });
    for (const categoryId of specialties) {
      await db.orm.public.StaffCategory.create({ staffId: staff.id, categoryId });
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'CREATE_ACCOUNT',
      entityType: 'Account',
      entityId: account.id,
      newData: { email: data.email, role: data.role },
    });

    return { accountId: account.id, staffId: staff.id };
  }
}
