import { db } from '../../prisma/db.js';
import { pgVarchar } from '../../prisma/contract-compat.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../errors/index.js';
import { generateAuditLog } from '../../utils/audit.js';
import { isStaffEligibleForServices } from './staff.rules.js';

export interface EligibleStaffInfo {
  id: string;
  firstName: string;
  lastName: string;
  primaryRole: string;
}

export interface StaffProfile {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  primaryRole: string;
  employmentType: 'FULL_TIME' | 'PART_TIME';
  workStatus: 'ON_DUTY' | 'DAY_OFF' | 'UNAVAILABLE';
  createdAt: Date;
  updatedAt: Date;
}

export class StaffService {
  static async listEligibleForServices(serviceIds: string[]): Promise<EligibleStaffInfo[]> {
    for (const serviceId of serviceIds) {
      const service = await db.orm.public.Service.where({ id: serviceId }).first();
      if (!service) throw new NotFoundError(`Service not found: ${serviceId}`);
      if (!service.isActive) throw new BadRequestError(`Service is inactive: ${service.name}`);

      const category = await db.orm.public.ServiceCategory.where({ id: service.categoryId }).first();
      if (!category || !category.isActive) {
        throw new BadRequestError(`Service category is inactive: ${service.name}`);
      }
    }

    const assignmentsByService = await Promise.all(serviceIds.map(async (serviceId) => {
      const assignments = await db.orm.public.StaffService.where({ serviceId }).all();
      return new Set(assignments.map((assignment) => assignment.staffId));
    }));
    const candidateIds = assignmentsByService[0] ?? new Set<string>();

    const eligible: EligibleStaffInfo[] = [];
    for (const staffId of candidateIds) {
      const staff = await db.orm.public.Staff.where({ id: staffId }).first();
      const assignedServiceIds = serviceIds.filter((_, index) => assignmentsByService[index]?.has(staffId));
      if (!staff || !isStaffEligibleForServices(staff.workStatus, assignedServiceIds, serviceIds)) continue;
      eligible.push({
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        primaryRole: staff.primaryRole,
      });
    }

    return eligible.sort((left, right) => left.firstName.localeCompare(right.firstName) || left.lastName.localeCompare(right.lastName));
  }

  /**
   * Get a staff member by ID.
   * - STAFF can view their own profile
   * - ADMIN/MANAGER can view any staff member
   */
  static async getById(staffId: string, requestingUserId: string, requestingRole: string): Promise<StaffProfile> {
    const staff = await db.orm.public.Staff.where({ id: staffId }).first();
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    // STAFF can only view their own profile unless they are admin/manager.
    // requestingUserId is an account ID, so compare against the staff account link.
    if (requestingRole === 'STAFF' && staff.accountId !== requestingUserId) {
      throw new ForbiddenError('You do not have permission to view this staff member');
    }

    return this.mapStaff(staff);
  }

  /**
   * Get the staff profile for the authenticated user's account.
   * Only works if the user has a STAFF role.
   */
  static async getMyProfile(userId: string, userRole: string): Promise<StaffProfile> {
    // Only staff members can access their own staff profile
    if (userRole !== 'STAFF' && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      throw new NotFoundError('No staff profile found for this account');
    }

    const staff = await db.orm.public.Staff.where({ accountId: userId }).first();
    if (!staff) {
      throw new NotFoundError('No staff profile found for this account');
    }

    return this.mapStaff(staff);
  }

  /**
   * List staff members with pagination.
   * Only ADMIN/MANAGER can list all staff.
   */
  static async list(page: number, limit: number, requestingRole: string): Promise<{ staff: StaffProfile[]; total: number }> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can list all staff');
    }

    // Clamp limit to a reasonable maximum (1-100)
    const clampedLimit = Math.max(1, Math.min(limit, 100));
    const skip = (page - 1) * clampedLimit;

    // Get total count
    const totalResult = await db.orm.public.Staff
      .where({})
      .aggregate((aggregate) => ({ total: aggregate.count() }));
    const total = typeof totalResult.total === 'number' ? totalResult.total : 0;

    // Get paginated results using database-level pagination
    const staffRaw = db.orm.public.Staff
      .orderBy((s) => s.createdAt.desc())
      .offset(skip)
      .limit(clampedLimit)
      .all();

    const staff: StaffProfile[] = [];
    if (Array.isArray(staffRaw)) {
      for (const s of staffRaw) {
        staff.push(this.mapStaff(s));
      }
    } else {
      for await (const s of staffRaw) {
        staff.push(this.mapStaff(s));
      }
    }

    return { staff, total };
  }

  /**
   * Create a new staff member.
   * Only ADMIN/MANAGER can create staff.
   */
  static async create(data: {
    accountId: string;
    firstName: string;
    lastName: string;
    phone?: string;
    primaryRole: string;
    employmentType: 'FULL_TIME' | 'PART_TIME';
    workStatus?: 'ON_DUTY' | 'DAY_OFF' | 'UNAVAILABLE';
  }, requestingUserId: string): Promise<StaffProfile> {
    // Only admins/managers can create staff
    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can create staff members');
    }

    // Verify the account exists
    const account = await db.orm.public.Account.where({ id: data.accountId }).first();
    if (!account) {
      throw new NotFoundError('Account not found');
    }

    // Check if the account has a staff profile already
    const existing = await db.orm.public.Staff.where({ accountId: data.accountId }).first();
    if (existing) {
      throw new ConflictError('A staff profile already exists for this account');
    }

    // Verify the account has STAFF role (or can be upgraded)
    if (account.role !== 'STAFF') {
      throw new BadRequestError('The account must have STAFF role to be promoted to staff member');
    }

    const staff = await db.orm.public.Staff.create({
      accountId: data.accountId,
      firstName: pgVarchar<100>(data.firstName),
      lastName: pgVarchar<100>(data.lastName),
      phone: data.phone ? pgVarchar<30>(data.phone) : null,
      primaryRole: pgVarchar<100>(data.primaryRole),
      employmentType: data.employmentType,
      workStatus: data.workStatus ?? 'DAY_OFF',
    });

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'CREATE_STAFF',
      entityType: 'Staff',
      entityId: staff.id,
      newData: this.auditData(staff),
    });

    return this.mapStaff(staff);
  }

  /**
   * Update a staff member's profile.
   * - STAFF can update their own phone
   * - ADMIN/MANAGER can update employment details
   */
  static async updateOwnProfile(accountId: string, data: { phone?: string }): Promise<StaffProfile> {
    const staff = await db.orm.public.Staff.where({ accountId }).first();
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    // Build update data (only phone is allowed for self-service)
    const updateData: Record<string, unknown> = {};
    if (data.phone !== undefined) {
      updateData.phone = data.phone;
    }

    const updated = await db.orm.public.Staff
      .where({ id: staff.id })
      .update(updateData);

    if (!updated) {
      throw new NotFoundError('Staff member not found');
    }

    await generateAuditLog({
      actorAccountId: accountId,
      action: 'UPDATE_STAFF_PROFILE',
      entityType: 'Staff',
      entityId: staff.id,
      oldData: this.auditData(staff),
      newData: this.auditData(updated),
    });

    return this.mapStaff(updated);
  }

  /**
   * Update a staff member's employment details.
   * Only ADMIN/MANAGER can update employment details.
   */
  static async updateEmployment(staffId: string, data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    primaryRole?: string;
    employmentType?: 'FULL_TIME' | 'PART_TIME';
    workStatus?: 'ON_DUTY' | 'DAY_OFF' | 'UNAVAILABLE';
  }, requestingUserId: string): Promise<StaffProfile> {
    // Only admins/managers can update employment details
    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can update staff employment details');
    }

    const staff = await db.orm.public.Staff.where({ id: staffId }).first();
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    // Validate fields
    if (data.firstName !== undefined && data.firstName.trim().length === 0) {
      throw new BadRequestError('First name cannot be empty');
    }
    if (data.lastName !== undefined && data.lastName.trim().length === 0) {
      throw new BadRequestError('Last name cannot be empty');
    }
    if (data.primaryRole !== undefined && data.primaryRole.trim().length === 0) {
      throw new BadRequestError('Primary role cannot be empty');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.primaryRole !== undefined) updateData.primaryRole = data.primaryRole;
    if (data.employmentType !== undefined) updateData.employmentType = data.employmentType;
    if (data.workStatus !== undefined) updateData.workStatus = data.workStatus;

    const updated = await db.orm.public.Staff
      .where({ id: staffId })
      .update(updateData);

    if (!updated) {
      throw new NotFoundError('Staff member not found');
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'UPDATE_STAFF_EMPLOYMENT',
      entityType: 'Staff',
      entityId: staffId,
      oldData: this.auditData(staff),
      newData: this.auditData(updated),
    });

    return this.mapStaff(updated);
  }

  /**
   * Map a Prisma staff record to StaffProfile
   */
  private static mapStaff(staff: {
    id: string;
    accountId: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    primaryRole: string;
    employmentType: 'FULL_TIME' | 'PART_TIME';
    workStatus: 'ON_DUTY' | 'DAY_OFF' | 'UNAVAILABLE';
    createdAt: Date;
    updatedAt: Date;
  }): StaffProfile {
    return {
      id: staff.id,
      accountId: staff.accountId,
      firstName: staff.firstName,
      lastName: staff.lastName,
      phone: staff.phone,
      primaryRole: staff.primaryRole,
      employmentType: staff.employmentType,
      workStatus: staff.workStatus,
      createdAt: staff.createdAt,
      updatedAt: staff.updatedAt,
    };
  }

  /**
   * Map a staff member to audit-friendly data
   */
  private static auditData(staff: {
    id: string;
    accountId: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    primaryRole: string;
    employmentType: 'FULL_TIME' | 'PART_TIME';
    workStatus: 'ON_DUTY' | 'DAY_OFF' | 'UNAVAILABLE';
  }) {
    return {
      id: staff.id,
      accountId: staff.accountId,
      firstName: staff.firstName,
      lastName: staff.lastName,
      phone: staff.phone,
      primaryRole: staff.primaryRole,
      employmentType: staff.employmentType,
      workStatus: staff.workStatus,
    };
  }
}
