import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';

export async function registerController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, role } = req.body;
    const result = await AuthService.register(email, password, role);
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
