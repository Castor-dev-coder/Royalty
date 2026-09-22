import { db } from '../../prisma/db.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../errors/index.js';
import { generateAuditLog } from '../../utils/audit.js';

export interface CustomerProfile {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CustomerService {
  /**
   * Get a customer by ID.
   * - Authenticated users can view their own customer profile
   * - ADMIN/MANAGER can view any customer
   */
  static async getById(customerId: string, requestingUserId: string, requestingRole: string): Promise<CustomerProfile> {
    const customer = await db.orm.public.Customer.where({ id: customerId }).first();
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    // Users can only view their own customer profile unless they are admin/manager
    // A user's customer profile is linked to their account
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      // Non-admin users can only view their own customer profile
      const account = await db.orm.public.Account.where({ id: requestingUserId }).first();
      if (!account) {
        throw new NotFoundError('Account not found');
      }
      // Check if this customer belongs to the requesting user
      if (customer.accountId !== requestingUserId) {
        throw new ForbiddenError('You do not have permission to view this customer');
      }
    }

    return {
      id: customer.id,
      accountId: customer.accountId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      gender: customer.gender,
      phone: customer.phone,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  /**
   * Get the customer profile for the authenticated user's account.
   */
  static async getMyProfile(userId: string): Promise<CustomerProfile> {
    // First check if the user has a customer profile
    const customer = await db.orm.public.Customer.where({ accountId: userId }).first();
    if (!customer) {
      throw new NotFoundError('No customer profile found for this account');
    }

    return {
      id: customer.id,
      accountId: customer.accountId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      gender: customer.gender,
      phone: customer.phone,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  /**
   * List customers with pagination.
   * Only ADMIN/MANAGER can list all customers.
   */
  static async list(page: number, limit: number, requestingRole: string): Promise<{ customers: CustomerProfile[]; total: number }> {
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can list all customers');
    }

    // Clamp limit to a reasonable maximum (1-100)
    const clampedLimit = Math.max(1, Math.min(limit, 100));
    const skip = (page - 1) * clampedLimit;

    // Get total count
    const totalResult = await db.orm.public.Customer.where({}).count();
    const total = typeof totalResult === 'number' ? totalResult : 0;

    // Get paginated results using database-level pagination
    const customersRaw = db.orm.public.Customer
      .orderBy((c) => c.createdAt.desc())
      // @ts-expect-error - Prisma 8 RC types don't expose skip on ordered Collection
      .skip(skip)
      .take(clampedLimit)
      .all();

    const customers: CustomerProfile[] = [];
    if (Array.isArray(customersRaw)) {
      for (const customer of customersRaw) {
        customers.push(this.mapCustomer(customer));
      }
    } else {
      for await (const customer of customersRaw) {
        customers.push(this.mapCustomer(customer));
      }
    }

    return { customers, total };
  }

  /**
   * Create a new customer profile.
   * Only ADMIN/MANAGER can create customers.
   */
  static async create(data: { accountId: string; firstName: string; lastName: string; gender?: string; phone?: string }, requestingUserId: string, requestingRole: string): Promise<CustomerProfile> {
    // Only admins/managers can create customers
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can create customers');
    }

    // Verify the account exists
    const account = await db.orm.public.Account.where({ id: data.accountId }).first();
    if (!account) {
      throw new NotFoundError('Account not found');
    }

    // Check if a customer profile already exists for this account
    const existing = await db.orm.public.Customer.where({ accountId: data.accountId }).first();
    if (existing) {
      throw new ConflictError('A customer profile already exists for this account');
    }

    const customer = await db.orm.public.Customer.create({
      accountId: data.accountId,
      firstName: data.firstName,
      lastName: data.lastName,
      gender: data.gender ?? null,
      phone: data.phone ?? null,
    });

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'CREATE_CUSTOMER',
      entityType: 'Customer',
      entityId: customer.id,
      newData: this.auditData(customer),
    });

    return this.mapCustomer(customer);
  }

  /**
   * Update a customer profile.
   * - Users can update their own customer profile
   * - ADMIN/MANAGER can update any customer
   */
  static async update(customerId: string, data: { firstName?: string; lastName?: string; gender?: string; phone?: string }, requestingUserId: string, requestingRole: string): Promise<CustomerProfile> {
    const customer = await db.orm.public.Customer.where({ id: customerId }).first();
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    // Authorization check
    if (requestingRole !== 'ADMIN' && requestingRole !== 'MANAGER') {
      // Non-admin users can only update their own customer profile
      if (customer.accountId !== requestingUserId) {
        throw new ForbiddenError('You do not have permission to update this customer');
      }
    }

    // If firstName provided, validate not empty
    if (data.firstName !== undefined && data.firstName.trim().length === 0) {
      throw new BadRequestError('First name cannot be empty');
    }

    // If lastName provided, validate not empty
    if (data.lastName !== undefined && data.lastName.trim().length === 0) {
      throw new BadRequestError('Last name cannot be empty');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.phone !== undefined) updateData.phone = data.phone;

    const updated = await db.orm.public.Customer
      .where({ id: customerId })
      .update(updateData);

    if (!updated) {
      throw new NotFoundError('Customer not found');
    }

    await generateAuditLog({
      actorAccountId: requestingUserId,
      action: 'UPDATE_CUSTOMER',
      entityType: 'Customer',
      entityId: customerId,
      oldData: this.auditData(customer),
      newData: this.auditData(updated),
    });

    return this.mapCustomer(updated);
  }

  /**
   * Map a Prisma customer record to CustomerProfile
   */
  private static mapCustomer(customer: {
    id: string;
    accountId: string;
    firstName: string;
    lastName: string;
    gender: string | null;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CustomerProfile {
    return {
      id: customer.id,
      accountId: customer.accountId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      gender: customer.gender,
      phone: customer.phone,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  /**
   * Map a customer to audit-friendly data (exclude sensitive fields)
   */
  private static auditData(customer: {
    id: string;
    accountId: string;
    firstName: string;
    lastName: string;
    gender: string | null;
    phone: string | null;
  }) {
    return {
      id: customer.id,
      accountId: customer.accountId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      gender: customer.gender,
      phone: customer.phone,
    };
  }
}
