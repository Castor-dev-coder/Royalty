import { Request, Response, NextFunction } from 'express';
import { CustomerService } from './customers.service.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import {
  createCustomerSchema,
  CreateCustomerRequest,
  updateCustomerSchema,
  UpdateCustomerRequest,
} from './customers.schemas.js';
import { validateRequest } from '../../middleware/validator.js';

// GET /customers/:id - Get customer by ID
export async function getCustomerController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const customer = await CustomerService.getById(
      id,
      req.user!.userId,
      req.user!.role
    );
    res.json({ data: customer });
  } catch (error) {
    next(error);
  }
}

// GET /customers/me - Get own customer profile
export async function getMyCustomerController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const customer = await CustomerService.getMyProfile(req.user!.userId);
    res.json({ data: customer });
  } catch (error) {
    next(error);
  }
}

// GET /customers - List customers (admin only)
export async function listCustomersController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(String(req.query.page)) || 1;
    const limit = parseInt(String(req.query.limit)) || 20;

    const { customers, total } = await CustomerService.list(page, limit, req.user!.role);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: {
        customers,
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

// POST /customers - Create customer (admin only)
export async function createCustomerController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // The validated body is used, so the name that was trimmed and the
    // number that was normalised are the ones that are stored.
    const { accountId, firstName, lastName, gender, phone } = (req as Request & {
      validatedData: CreateCustomerRequest;
    }).validatedData;

    const customer = await CustomerService.create(
      { accountId, firstName, lastName, gender, phone },
      req.user!.userId,
      req.user!.role
    );

    res.status(201).json({ data: customer });
  } catch (error) {
    next(error);
  }
}

// PATCH /customers/:id - Update customer
export async function updateCustomerController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const { firstName, lastName, gender, phone } = (req as Request & {
      validatedData: UpdateCustomerRequest;
    }).validatedData;

    const customer = await CustomerService.update(
      id,
      { firstName, lastName, gender, phone },
      req.user!.userId,
      req.user!.role
    );

    res.json({ data: customer });
  } catch (error) {
    next(error);
  }
}
