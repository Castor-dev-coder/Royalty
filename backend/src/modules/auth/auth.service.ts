import bcrypt from 'bcryptjs';
import { db } from '../../prisma/db.js';
import { createAccessToken, createRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../errors/index.js';

export interface AuthResult {
  id: string;
  email: string;
  role: string;
  accessToken: string;
  refreshToken: string;
}

export interface TokenResult {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  static async register(email: string, password: string, role: string): Promise<AuthResult> {
    // Check if account already exists
    const existing = await db.orm.public.Account.where({ email }).first();
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create account
    const account = await db.orm.public.Account.create({
      email,
      passwordHash,
      role: role as 'ADMIN' | 'MANAGER' | 'STAFF' | 'CUSTOMER',
      status: 'ACTIVE' as const,
    });

    // Generate tokens
    const payload = { sub: account.id, email: account.email, role: account.role };
    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken(payload);

    return {
      id: account.id,
      email: account.email,
      role: account.role,
      accessToken,
      refreshToken,
    };
  }

  static async login(email: string, password: string): Promise<AuthResult> {
    // Find account
    const account = await db.orm.public.Account.where({ email }).first();
    if (!account) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if account is active
    if (account.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, account.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Generate tokens
    const payload = { sub: account.id, email: account.email, role: account.role };
    const accessToken = createAccessToken(payload);
    const refreshToken = createRefreshToken(payload);

    return {
      id: account.id,
      email: account.email,
      role: account.role,
      accessToken,
      refreshToken,
    };
  }

  static async refreshToken(refreshTokenValue: string): Promise<TokenResult> {
    // Verify refresh token
    const payload = verifyRefreshToken(refreshTokenValue);

    // Check if account still exists and is active
    const account = await db.orm.public.Account.where({ id: payload.sub }).first();
    if (!account || account.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account not found or deactivated');
    }

    // Generate new tokens
    const newPayload = { sub: account.id, email: account.email, role: account.role };
    const accessToken = createAccessToken(newPayload);
    const newRefreshToken = createRefreshToken(newPayload);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  static async getMe(userId: string) {
    const account = await db.orm.public.Account.where({ id: userId }).first();
    if (!account) {
      throw new NotFoundError('User not found');
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

  static async logout(userId: string): Promise<void> {
    // In a stateless JWT system, logout is handled by the client discarding tokens.
    // No database operation needed - client should discard access and refresh tokens.
    return;
  }
}
