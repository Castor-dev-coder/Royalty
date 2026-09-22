import { Request, Response, NextFunction } from 'express';
import { StaffService } from './staff.service.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { createStaffSchema, updateOwnStaffProfileSchema, updateStaffEmploymentSchema } from './staff.schemas.js';
import { validateRequest } from '../../middleware/validator.js';

// GET /staff/:id - Get staff member by ID
export async function getStaffController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const staff = await StaffService.getById(
      id,
      req.user!.userId,
      req.user!.role
    );
    res.json({ data: staff });
  } catch (error) {
    next(error);
  }
}

// GET /staff/me - Get own staff profile
export async function getMyStaffController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const staff = await StaffService.getMyProfile(req.user!.userId, req.user!.role);
    res.json({ data: staff });
  } catch (error) {
    next(error);
  }
}

// GET /staff - List all staff (admin/manager only)
export async function listStaffController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(String(req.query.page)) || 1;
    const limit = parseInt(String(req.query.limit)) || 20;

    const { staff, total } = await StaffService.list(page, limit, req.user!.role);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: {
        staff,
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

// POST /staff - Create staff member (admin/manager only)
export async function createStaffController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { accountId, firstName, lastName, phone, primaryRole, employmentType, workStatus } = req.body;

    const staff = await StaffService.create(
      { accountId, firstName, lastName, phone, primaryRole, employmentType, workStatus },
      req.user!.userId
    );

    res.status(201).json({ data: staff });
  } catch (error) {
    next(error);
  }
}

// PATCH /staff/me - Update own staff profile (phone only)
export async function updateOwnStaffController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const { phone } = req.body;

    const staff = await StaffService.updateOwnProfile(id, { phone }, req.user!.userId);
    res.json({ data: staff });
  } catch (error) {
    next(error);
  }
}

// PATCH /staff/:id - Update staff employment details (admin/manager only)
export async function updateStaffController(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const { firstName, lastName, phone, primaryRole, employmentType, workStatus } = req.body;

    const staff = await StaffService.updateEmployment(
      id,
      { firstName, lastName, phone, primaryRole, employmentType, workStatus },
      req.user!.userId
    );

    res.json({ data: staff });
  } catch (error) {
    next(error);
  }
}
