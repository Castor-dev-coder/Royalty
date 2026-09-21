import { Router } from 'express';
import { loginController, registerController, refreshController } from '../modules/auth/auth.controller.js';
import { validateRequest } from '../middleware/validator.js';
import { loginSchema, registerSchema, refreshTokenSchema } from '../schemas/index.js';

export const authRouter = Router();

// POST /auth/register
authRouter.post('/register', validateRequest(registerSchema), registerController);

// POST /auth/login
authRouter.post('/login', validateRequest(loginSchema), loginController);

// POST /auth/refresh
authRouter.post('/refresh', validateRequest(refreshTokenSchema), refreshController);
