import { request, type HttpResponse } from './http.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  data: {
    id: string;
    email: string;
    role: string;
    accessToken: string;
    refreshToken: string;
  };
}

export async function login(
  baseUrl: string,
  email: string,
  password: string,
): Promise<HttpResponse<LoginResponse>> {
  return request<LoginResponse>(baseUrl, '/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function refreshToken(
  baseUrl: string,
  refreshTokenValue: string,
): Promise<HttpResponse<{ data: AuthTokens }>> {
  return request<{ data: AuthTokens }>(baseUrl, '/auth/refresh', {
    method: 'POST',
    body: { refreshToken: refreshTokenValue },
  });
}

export interface MeResponse {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

export async function getMe(
  baseUrl: string,
  accessToken: string,
): Promise<HttpResponse<MeResponse>> {
  return request<MeResponse>(baseUrl, '/api/me', { token: accessToken });
}
