import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import type { RegisterRequest } from '../../schemas/index.js';

export async function registerController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, firstName, lastName, gender, phone } =
      (req as Request & { validatedData: RegisterRequest }).validatedData;
    const result = await AuthService.register(email, password, { firstName, lastName, gender, phone });
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function loginController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function refreshController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    const result = await AuthService.refreshToken(refreshToken);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}
