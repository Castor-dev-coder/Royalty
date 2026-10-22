import { apiFetch, getAccessToken, mockApiEnabled } from '../api';

/**
 * Client for the staff-scoped API.
 *
 * Every call here targets an endpoint that resolves the signed-in staff
 * member from the authenticated account, so no request carries another
 * staff member's identifier. The API remains the authority on access; this
 * module only names the endpoints.
 */

export interface StaffProfile {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  primaryRole: string;
  employmentType: 'FULL_TIME' | 'PART_TIME';
  workStatus: 'ON_DUTY' | 'DAY_OFF' | 'UNAVAILABLE';
  createdAt: string;
  updatedAt: string;
}

export interface StaffAccount {
  id: string;
  email: string;
  role: string;
  status: 'ACTIVE' | 'DEACTIVATED';
  createdAt: string;
  updatedAt: string;
}

export interface StaffServiceInfo {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
  isActive: boolean;
}

export interface StaffAppointment {
  id: string;
  appointmentCode: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  status: string;
  services: Array<{
    serviceId: string;
    serviceName: string;
    price: number;
    durationMinutes: number;
  }>;
  customer: { id: string; firstName: string; lastName: string; phone: string | null } | null;
}

export interface StaffSchedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface StaffScheduleRequest {
  id: string;
  staffId: string;
  requestedDate: string;
  requestedStartTime: string | null;
  requestedEndTime: string | null;
  requestType: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedAt: string | null;
  createdAt: string;
}

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson(response: Response): Promise<any> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? payload?.message ?? 'The request could not be completed.');
  }
  return payload;
}

export const staffApi = {
  async getProfile(): Promise<StaffProfile> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/staff/me`, { headers: authHeaders() }));
    return payload.data as StaffProfile;
  },

  async getAccount(accountId: string): Promise<StaffAccount> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/accounts/${accountId}`, { headers: authHeaders() }));
    return payload.data as StaffAccount;
  },

  async updateOwnPhone(phone: string): Promise<StaffProfile> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/staff/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ phone }),
    }));
    return payload.data as StaffProfile;
  },

  async updateOwnEmail(email: string): Promise<StaffAccount> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/accounts/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ email }),
    }));
    return payload.data as StaffAccount;
  },

  async changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
    await readJson(await apiFetch(`${BASE_URL}/accounts/me/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ currentPassword, newPassword }),
    }));
  },

  async listAppointments(): Promise<StaffAppointment[]> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/appointments/staff/me?page=1&limit=100`, { headers: authHeaders() }));
    return (payload?.data?.appointments ?? []) as StaffAppointment[];
  },

  async updateAppointmentStatus(id: string, status: string): Promise<StaffAppointment> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/appointments/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status }),
    }));
    return payload?.data?.appointment as StaffAppointment;
  },

  async listSchedules(): Promise<StaffSchedule[]> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/schedules/staff/me`, { headers: authHeaders() }));
    return (payload?.data?.staffSchedules ?? []) as StaffSchedule[];
  },

  async listScheduleRequests(): Promise<StaffScheduleRequest[]> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/schedules/requests/me`, { headers: authHeaders() }));
    return (payload?.data?.scheduleRequests ?? []) as StaffScheduleRequest[];
  },

  async createScheduleRequest(input: {
    requestedDate: string;
    requestedStartTime?: string;
    requestedEndTime?: string;
    requestType: string;
    reason?: string;
  }): Promise<StaffScheduleRequest> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/schedules/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(input),
    }));
    return payload?.data?.scheduleRequest as StaffScheduleRequest;
  },

  async listServices(): Promise<StaffServiceInfo[]> {
    const payload = await readJson(await apiFetch(`${BASE_URL}/services/staff/me/services`, { headers: authHeaders() }));
    return (payload?.data?.services ?? []) as StaffServiceInfo[];
  },
};

/** True when the browser has a session but the API is unreachable. */
export function isDemoEnvironment(): boolean {
  return mockApiEnabled;
}
