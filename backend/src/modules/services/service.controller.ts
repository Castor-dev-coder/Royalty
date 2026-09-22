import { Request, Response, NextFunction } from 'express';
import { ServiceService } from './service.service.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validator.js';
import { createServiceCategorySchema, updateServiceCategorySchema, createServiceSchema, updateServiceSchema, assignStaffToServiceSchema, removeStaffFromServiceSchema } from './service.schemas.js';

// Helper to extract string param
const param = (req: Request, key: keyof typeof req.params): string => String(req.params[key]);

// GET /services/categories - List all service categories
export const listCategoriesController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const categories = await ServiceService.listCategories(req.user!.role);
    res.json({ data: { categories } });
  } catch (error) {
    next(error);
  }
};

// GET /services/categories/:id - Get a service category by ID
export const getCategoryController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const category = await ServiceService.getCategoryById(param(req, 'id'), req.user!.role);
    res.json({ data: { category } });
  } catch (error) {
    next(error);
  }
};

// POST /services/categories - Create a new service category
export const createCategoryController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const category = await ServiceService.createCategory(req.body, req.user!.userId);
    res.status(201).json({ data: { category } });
  } catch (error) {
    next(error);
  }
};

// PATCH /services/categories/:id - Update a service category
export const updateCategoryController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const category = await ServiceService.updateCategory(param(req, 'id'), req.body, req.user!.userId);
    res.json({ data: { category } });
  } catch (error) {
    next(error);
  }
};

// GET /services - List all services
export const listServicesController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const services = await ServiceService.listServices(req.user!.role);
    res.json({ data: { services } });
  } catch (error) {
    next(error);
  }
};

// GET /services/:id - Get a service by ID
export const getServiceController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const service = await ServiceService.getServiceById(param(req, 'id'), req.user!.role);
    res.json({ data: { service } });
  } catch (error) {
    next(error);
  }
};

// POST /services - Create a new service
export const createServiceController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const service = await ServiceService.createService(req.body, req.user!.userId);
    res.status(201).json({ data: { service } });
  } catch (error) {
    next(error);
  }
};

// PATCH /services/:id - Update a service
export const updateServiceController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const service = await ServiceService.updateService(param(req, 'id'), req.body, req.user!.userId);
    res.json({ data: { service } });
  } catch (error) {
    next(error);
  }
};

// GET /services/:id/staff - Get staff assigned to a service
export const getStaffForServiceController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const staff = await ServiceService.getStaffForService(param(req, 'id'), req.user!.role);
    res.json({ data: { staff } });
  } catch (error) {
    next(error);
  }
};

// GET /staff/:id/services - Get services a staff member can perform
export const getServicesForStaffController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const services = await ServiceService.getServicesForStaff(param(req, 'id'), req.user!.role);
    res.json({ data: { services } });
  } catch (error) {
    next(error);
  }
};

// POST /services/:id/assign - Assign staff to a service
export const assignStaffToServiceController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await ServiceService.assignStaffToService(param(req, 'id'), req.body.staffIds, req.user!.userId);
    res.status(201).json({ data: { message: 'Staff assigned successfully' } });
  } catch (error) {
    next(error);
  }
};

// DELETE /services/:id/staff/:staffId - Remove staff from a service
export const removeStaffFromServiceController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await ServiceService.removeStaffFromService(param(req, 'id'), param(req, 'staffId'), req.user!.userId);
    res.json({ data: { message: 'Staff removed successfully' } });
  } catch (error) {
    next(error);
  }
};
