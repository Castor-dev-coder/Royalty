import { db } from '../../prisma/db.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../errors/index.js';
import { generateAuditLog } from '../../utils/audit.js';

// Decimal serialization for JSON responses
function serializeDecimal(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  // Handle BigInt serialization from Prisma decimal (likely BigInt)
  if (typeof value === 'object' && value !== null) {
    if ('toString' in value) {
      return Number((value as { toString: () => string }).toString());
    }
  }
  return Number(value);
}

export interface ServiceCategoryInfo {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceInfo {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ServiceService {
  // ============================================================
  // Service Categories
  // ============================================================

  /** Get a service category by ID */
  static async getCategoryById(categoryId: string, requestingRole: string): Promise<ServiceCategoryInfo> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can view service categories');
    }

    const category = await db.orm.public.ServiceCategory.where({ id: categoryId }).first();
    if (!category) {
      throw new NotFoundError('Service category not found');
    }

    return this.mapCategory(category);
  }

  /** List all service categories */
  static async listCategories(requestingRole: string): Promise<ServiceCategoryInfo[]> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can view service categories');
    }

    const categories = await db.orm.public.ServiceCategory.orderBy((c) => c.name.asc()).all();
    return categories.map((c) => this.mapCategory(c));
  }

  /** Create a new service category */
  static async createCategory(data: { name: string }, requestingUserId: string): Promise<ServiceCategoryInfo> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can create service categories');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can create service categories');
    }

    // Check for duplicate name (case-insensitive would require raw SQL)
    const existing = await db.orm.public.ServiceCategory.where({ name: data.name }).first();
    if (existing) {
      throw new ConflictError('A service category with this name already exists');
    }

    const category = await db.orm.public.ServiceCategory.create({
      name: data.name,
      isActive: true,
    });

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'CREATE_SERVICE_CATEGORY',
      entityType: 'ServiceCategory',
      entityId: category.id,
      newData: { name: category.name, isActive: category.isActive },
    });

    return this.mapCategory(category);
  }

  /** Update a service category */
  static async updateCategory(
    categoryId: string,
    data: { name?: string; isActive?: boolean },
    requestingUserId: string
  ): Promise<ServiceCategoryInfo> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can update service categories');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can update service categories');
    }

    const category = await db.orm.public.ServiceCategory.where({ id: categoryId }).first();
    if (!category) {
      throw new NotFoundError('Service category not found');
    }

    // Check for duplicate name if changing
    if (data.name && data.name !== category.name) {
      const existing = await db.orm.public.ServiceCategory.where({ name: data.name }).first();
      if (existing) {
        throw new ConflictError('A service category with this name already exists');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await db.orm.public.ServiceCategory.where({ id: categoryId }).update(updateData);
    if (!updated) {
      throw new NotFoundError('Service category not found');
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'UPDATE_SERVICE_CATEGORY',
      entityType: 'ServiceCategory',
      entityId: categoryId,
      oldData: { name: category.name, isActive: category.isActive },
      newData: { name: updated.name, isActive: updated.isActive },
    });

    return this.mapCategory(updated);
  }

  // ============================================================
  // Services
  // ============================================================

  /** Get a service by ID with category info */
  static async getServiceById(serviceId: string, requestingRole: string): Promise<ServiceInfo> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can view services');
    }

    const service = await db.orm.public.Service.where({ id: serviceId }).first();
    if (!service) {
      throw new NotFoundError('Service not found');
    }

    // Get category name
    const category = await db.orm.public.ServiceCategory.where({ id: service.categoryId }).first();
    const categoryName = category ? category.name : 'Unknown';

    return this.mapServiceWithCategory(service, categoryName);
  }

  /** List all services with category info */
  static async listServices(requestingRole: string): Promise<ServiceInfo[]> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can view services');
    }

    const services = await db.orm.public.Service.orderBy((s) => s.name.asc()).all();

    const result: ServiceInfo[] = [];
    for (const service of services) {
      const category = await db.orm.public.ServiceCategory.where({ id: service.categoryId }).first();
      const categoryName = category ? category.name : 'Unknown';
      result.push(this.mapServiceWithCategory(service, categoryName));
    }

    return result;
  }

  /** Create a new service */
  static async createService(
    data: {
      categoryId: string;
      name: string;
      description?: string;
      price: number;
      durationMinutes: number;
    },
    requestingUserId: string
  ): Promise<ServiceInfo> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can create services');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can create services');
    }

    // Verify category exists
    const category = await db.orm.public.ServiceCategory.where({ id: data.categoryId }).first();
    if (!category) {
      throw new NotFoundError('Service category not found');
    }
    if (!category.isActive) {
      throw new BadRequestError('Cannot add service to an inactive category');
    }

    // Check for duplicate service name in the same category
    const existing = await db.orm.public.Service.where({ name: data.name, categoryId: data.categoryId }).first();
    if (existing) {
      throw new ConflictError('A service with this name already exists in this category');
    }

    const service = await db.orm.public.Service.create({
      categoryId: data.categoryId,
      name: data.name,
      description: data.description ?? null,
      price: data.price.toString(),
      durationMinutes: data.durationMinutes,
      isActive: true,
    });

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'CREATE_SERVICE',
      entityType: 'Service',
      entityId: service.id,
      newData: {
        categoryId: service.categoryId,
        name: service.name,
        description: service.description,
        price: serializeDecimal(service.price),
        durationMinutes: service.durationMinutes,
        isActive: service.isActive,
      },
    });

    const categoryName = category.name;
    return this.mapServiceWithCategory(service, categoryName);
  }

  /** Update a service */
  static async updateService(
    serviceId: string,
    data: {
      categoryId?: string;
      name?: string;
      description?: string | null;
      price?: number;
      durationMinutes?: number;
      isActive?: boolean;
    },
    requestingUserId: string
  ): Promise<ServiceInfo> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can update services');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can update services');
    }

    const service = await db.orm.public.Service.where({ id: serviceId }).first();
    if (!service) {
      throw new NotFoundError('Service not found');
    }

    // Verify new category if changing
    if (data.categoryId && data.categoryId !== service.categoryId) {
      const category = await db.orm.public.ServiceCategory.where({ id: data.categoryId }).first();
      if (!category) {
        throw new NotFoundError('Service category not found');
      }
      if (!category.isActive) {
        throw new BadRequestError('Cannot move service to an inactive category');
      }

      // Check for duplicate name in new category
      if (data.name && data.name !== service.name) {
        const existing = await db.orm.public.Service.where({
          name: data.name,
          categoryId: data.categoryId,
        }).first();
        if (existing) {
          throw new ConflictError('A service with this name already exists in this category');
        }
      }
    } else if (data.name && data.name !== service.name) {
      // Check for duplicate name in same category
      const existing = await db.orm.public.Service.where({
        name: data.name,
        categoryId: service.categoryId,
      }).first();
      if (existing) {
        throw new ConflictError('A service with this name already exists in this category');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price.toString();
    if (data.durationMinutes !== undefined) updateData.durationMinutes = data.durationMinutes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await db.orm.public.Service.where({ id: serviceId }).update(updateData);
    if (!updated) {
      throw new NotFoundError('Service not found');
    }

    // Get category name for response
    const category = await db.orm.public.ServiceCategory.where({ id: updated.categoryId }).first();
    const categoryName = category ? category.name : 'Unknown';

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'UPDATE_SERVICE',
      entityType: 'Service',
      entityId: serviceId,
      oldData: {
        categoryId: service.categoryId,
        name: service.name,
        description: service.description,
        price: serializeDecimal(service.price),
        durationMinutes: service.durationMinutes,
        isActive: service.isActive,
      },
      newData: {
        categoryId: updated.categoryId,
        name: updated.name,
        description: updated.description,
        price: serializeDecimal(updated.price),
        durationMinutes: updated.durationMinutes,
        isActive: updated.isActive,
      },
    });

    return this.mapServiceWithCategory(updated, categoryName);
  }

  // ============================================================
  // Staff-Service Assignments
  // ============================================================

  /** Get staff assigned to a service */
  static async getStaffForService(serviceId: string, requestingRole: string): Promise<StaffProfile[]> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can view staff-service assignments');
    }

    // Verify service exists
    const service = await db.orm.public.Service.where({ id: serviceId }).first();
    if (!service) {
      throw new NotFoundError('Service not found');
    }

    const assignments = await db.orm.public.StaffService.where({ serviceId }).all();

    const result: StaffProfile[] = [];
    for (const assignment of assignments) {
      const staff = await db.orm.public.Staff.where({ id: assignment.staffId }).first();
      if (staff) {
        result.push({
          id: staff.id,
          accountId: staff.accountId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          phone: staff.phone,
          primaryRole: staff.primaryRole,
        });
      }
    }

    return result;
  }

  /** Get services a staff member can perform */
  static async getServicesForStaff(staffId: string, requestingRole: string): Promise<ServiceInfo[]> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can view staff-service assignments');
    }

    // Verify staff exists
    const staff = await db.orm.public.Staff.where({ id: staffId }).first();
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    const assignments = await db.orm.public.StaffService.where({ staffId }).all();

    const result: ServiceInfo[] = [];
    for (const assignment of assignments) {
      const service = await db.orm.public.Service.where({ id: assignment.serviceId }).first();
      if (service) {
        const category = await db.orm.public.ServiceCategory.where({ id: service.categoryId }).first();
        const categoryName = category ? category.name : 'Unknown';
        result.push(this.mapServiceWithCategory(service, categoryName));
      }
    }

    return result;
  }

  /** Assign staff to a service */
  static async assignStaffToService(
    serviceId: string,
    staffIds: string[],
    requestingUserId: string
  ): Promise<void> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can assign staff to services');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can assign staff to services');
    }

    // Verify service exists
    const service = await db.orm.public.Service.where({ id: serviceId }).first();
    if (!service) {
      throw new NotFoundError('Service not found');
    }

    // Verify all staff exist and don't already have this service
    const existingAssignments = await db.orm.public.StaffService.where({ serviceId }).all();
    const existingStaffIds = new Set(existingAssignments.map((a) => a.staffId));

    for (const staffId of staffIds) {
      const staff = await db.orm.public.Staff.where({ id: staffId }).first();
      if (!staff) {
        throw new NotFoundError(`Staff member not found: ${staffId}`);
      }
      if (existingStaffIds.has(staffId)) {
        throw new ConflictError(`Staff member ${staffId} is already assigned to this service`);
      }
    }

    // Create assignments
    for (const staffId of staffIds) {
      await db.orm.public.StaffService.create({
        staffId,
        serviceId,
      });
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'ASSIGN_STAFF_TO_SERVICE',
      entityType: 'Service',
      entityId: serviceId,
      newData: { staffIds },
    });
  }

  /** Remove staff from a service */
  static async removeStaffFromService(
    serviceId: string,
    staffId: string,
    requestingUserId: string
  ): Promise<void> {
    if (requestingUserId === '') {
      throw new ForbiddenError('Only administrators can remove staff from services');
    }

    const requester = await db.orm.public.Account.where({ id: requestingUserId }).first();
    if (!requester || (requester.role !== 'ADMIN' && requester.role !== 'MANAGER')) {
      throw new ForbiddenError('Only administrators can remove staff from services');
    }

    // Verify service exists
    const service = await db.orm.public.Service.where({ id: serviceId }).first();
    if (!service) {
      throw new NotFoundError('Service not found');
    }

    // Verify assignment exists
    const assignment = await db.orm.public.StaffService.where({ staffId, serviceId }).first();
    if (!assignment) {
      throw new NotFoundError('Staff is not assigned to this service');
    }

    await db.orm.public.StaffService.where({ staffId, serviceId }).delete();

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'REMOVE_STAFF_FROM_SERVICE',
      entityType: 'Service',
      entityId: serviceId,
      oldData: { staffId },
    });
  }

  // ============================================================
  // Mapping helpers
  // ============================================================

  private static mapCategory(category: {
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ServiceCategoryInfo {
    return {
      id: category.id,
      name: category.name,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private static mapServiceWithCategory(
    service: {
      id: string;
      categoryId: string;
      name: string;
      description: string | null;
      price: unknown;
      durationMinutes: number;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    categoryName: string
  ): ServiceInfo {
    return {
      id: service.id,
      categoryId: service.categoryId,
      categoryName,
      name: service.name,
      description: service.description,
      price: serializeDecimal(service.price),
      durationMinutes: service.durationMinutes,
      isActive: service.isActive,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };
  }

  private static mapService(
    service: {
      id: string;
      categoryId: string;
      name: string;
      description: string | null;
      price: unknown;
      durationMinutes: number;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }
  ): Omit<ServiceInfo, 'categoryName'> {
    return {
      id: service.id,
      categoryId: service.categoryId,
      name: service.name,
      description: service.description,
      price: serializeDecimal(service.price),
      durationMinutes: service.durationMinutes,
      isActive: service.isActive,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };
  }
}

// Minimal staff profile for assignment listings
interface StaffProfile {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  primaryRole: string;
}
