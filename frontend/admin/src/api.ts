type AccountRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'CUSTOMER';
type AccountStatus = 'ACTIVE' | 'DEACTIVATED';
type AppointmentStatus = 'RESERVED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
type PaymentStatus = 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';

interface MockAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: string;
  passwordHash?: string;
  requiresPasswordChange?: boolean;
  passwordChangedAt?: string | null;
}

interface MockCustomer {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface MockStaff {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  phone: string;
  primaryRole: string;
  employmentType: 'FULL_TIME' | 'PART_TIME';
  workStatus: 'ON_DUTY' | 'DAY_OFF' | 'UNAVAILABLE';
  createdAt: string;
  updatedAt: string;
}

interface MockService {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
  imageUrl?: string | null;
}

interface MockAppointment {
  id: string;
  appointmentCode: string;
  customerId: string;
  staffId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  status: AppointmentStatus;
  serviceIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface MockPayment {
  id: string;
  appointmentId: string;
  amount: number;
  paymentMethod: 'CASH' | 'GCASH';
  status: PaymentStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MockReview {
  id: string;
  appointmentId: string;
  customerId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface MockSchedule {
  id: string;
  staffId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface MockData {
  accounts: MockAccount[];
  customers: MockCustomer[];
  staff: MockStaff[];
  categories: Array<{ id: string; name: string; isActive: boolean }>;
  services: MockService[];
  appointments: MockAppointment[];
  payments: MockPayment[];
  reviews: MockReview[];
  schedules: MockSchedule[];
  timeOff: MockTimeOff[];
  scheduleRequests: Array<{ id: string; status: string }>;
  paymentActivity: Array<{ id: string; message: string; createdAt: string }>;
}

interface MockTimeOff {
  id: string;
  staffId: string;
  type: 'VACATION' | 'DAY_OFF';
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  createdAt: string;
}

const STORAGE_KEY = 'royalty.admin.mock-data.v1';
const MOCK_ACCESS_TOKEN_KEY = 'royalty.admin.mock-access-token.v1';
const MOCK_REFRESH_TOKEN_KEY = 'royalty.admin.mock-refresh-token.v1';
const MOCK_TOKEN = 'royalty-dev-mock-admin';

export const mockApiEnabled = import.meta.env.DEV
  && (import.meta.env.VITE_USE_MOCK_API === 'true' || !import.meta.env.VITE_API_URL);

export function getAccessToken(): string | null {
  return localStorage.getItem(mockApiEnabled ? MOCK_ACCESS_TOKEN_KEY : 'accessToken');
}

export function storeAccessTokens(accessToken: string, refreshToken: string): void {
  if (mockApiEnabled) {
    localStorage.setItem(MOCK_ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(MOCK_REFRESH_TOKEN_KEY, refreshToken);
    return;
  }
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearAccessTokens(): void {
  if (mockApiEnabled) {
    localStorage.removeItem(MOCK_ACCESS_TOKEN_KEY);
    localStorage.removeItem(MOCK_REFRESH_TOKEN_KEY);
    return;
  }
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

function dateAtOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidTimeRange(startTime: string | null, endTime: string | null): boolean {
  if ((startTime === null) !== (endTime === null)) return false;
  if (startTime === null || endTime === null) return true;
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)
    && startTime < endTime;
}

function isoAtOffset(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function hashString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const words = new Uint32Array(64);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) & ~63));
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const lengthBytes = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) lengthBytes[7 - i] = (bitLength >>> (i * 8)) & 0xff;
  padded.set(lengthBytes, padded.length - 8);

  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    for (let i = 0; i < 16; i += 1) {
      const start = chunk + i * 4;
      words[i] = (padded[start] << 24) | (padded[start + 1] << 16) | (padded[start + 2] << 8) | padded[start + 3];
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(words[i - 15], 7) ^ rotr(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotr(words[i - 2], 17) ^ rotr(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[i] + words[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((value) => value.toString(16).padStart(8, '0')).join('');
}

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function isValidPassword(password: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
}

function makeDemoData(): MockData {
  const accounts: MockAccount[] = [
    { id: '11111111-0000-4000-8000-000000000001', email: 'admin@seed.royalty.local', firstName: 'Morgan', lastName: 'Reyes', role: 'ADMIN', status: 'ACTIVE', createdAt: isoAtOffset(-180), passwordHash: hashString('RoyaltyDemo2026!'), requiresPasswordChange: false, passwordChangedAt: isoAtOffset(-180) },
    { id: '11111111-0000-4000-8000-000000000002', email: 'manager@seed.royalty.local', firstName: 'Alex', lastName: 'Santos', role: 'MANAGER', status: 'ACTIVE', createdAt: isoAtOffset(-120), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000003', email: 'elena.morales@example.test', firstName: 'Elena', lastName: 'Morales', role: 'STAFF', status: 'ACTIVE', createdAt: isoAtOffset(-100), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000004', email: 'jules.navaro@example.test', firstName: 'Jules', lastName: 'Navarro', role: 'STAFF', status: 'ACTIVE', createdAt: isoAtOffset(-85), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000005', email: 'mika.tan@example.test', firstName: 'Mika', lastName: 'Tan', role: 'STAFF', status: 'ACTIVE', createdAt: isoAtOffset(-75), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000006', email: 'bea.lim@example.test', firstName: 'Bea', lastName: 'Lim', role: 'STAFF', status: 'DEACTIVATED', createdAt: isoAtOffset(-60), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000007', email: 'camille.dizon@example.test', firstName: 'Camille', lastName: 'Dizon', role: 'CUSTOMER', status: 'ACTIVE', createdAt: isoAtOffset(-55), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000008', email: 'marco.villanueva@example.test', firstName: 'Marco', lastName: 'Villanueva', role: 'CUSTOMER', status: 'ACTIVE', createdAt: isoAtOffset(-45), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000009', email: 'bea.santos@example.test', firstName: 'Bea', lastName: 'Santos', role: 'CUSTOMER', status: 'ACTIVE', createdAt: isoAtOffset(-35), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000010', email: 'renz.aguilar@example.test', firstName: 'Renz', lastName: 'Aguilar', role: 'CUSTOMER', status: 'ACTIVE', createdAt: isoAtOffset(-25), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000011', email: 'nicole.ramos@example.test', firstName: 'Nicole', lastName: 'Ramos', role: 'CUSTOMER', status: 'ACTIVE', createdAt: isoAtOffset(-18), requiresPasswordChange: true },
    { id: '11111111-0000-4000-8000-000000000012', email: 'sophie.lee@example.test', firstName: 'Sophie', lastName: 'Lee', role: 'CUSTOMER', status: 'ACTIVE', createdAt: isoAtOffset(-8), requiresPasswordChange: true },
  ];
  const customers: MockCustomer[] = accounts
    .filter((account) => account.role === 'CUSTOMER')
    .map((account, index) => ({
      id: `22222222-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      accountId: account.id,
      firstName: account.firstName,
      lastName: account.lastName,
      phone: `0917-555-${String(1100 + index)}`,
    }));
  const staff: MockStaff[] = accounts
    .filter((account) => account.role === 'STAFF')
    .map((account, index) => ({
      id: `33333333-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      accountId: account.id,
      firstName: account.firstName,
      lastName: account.lastName,
      phone: `0918-555-${String(2200 + index)}`,
      primaryRole: ['Senior Stylist', 'Nail Specialist', 'Colorist', 'Junior Stylist'][index],
      employmentType: index === 1 ? 'PART_TIME' : 'FULL_TIME',
      workStatus: index === 3 ? 'UNAVAILABLE' : index === 2 ? 'DAY_OFF' : 'ON_DUTY',
      createdAt: account.createdAt,
      updatedAt: account.createdAt,
    }));
  const categories = [
    { id: '44444444-0000-4000-8000-000000000001', name: 'Hair', isActive: true },
    { id: '44444444-0000-4000-8000-000000000002', name: 'Nails', isActive: true },
    { id: '44444444-0000-4000-8000-000000000003', name: 'Skin & Spa', isActive: true },
  ];
  const services: MockService[] = [
    { id: '55555555-0000-4000-8000-000000000001', categoryId: categories[0].id, name: 'Classic Haircut', description: 'Consultation, cut and finish.', price: 800, durationMinutes: 60, isActive: true, imageUrl: null },
    { id: '55555555-0000-4000-8000-000000000002', categoryId: categories[0].id, name: 'Full Hair Color', description: 'Personalized color with a nourishing finish.', price: 2400, durationMinutes: 150, isActive: true, imageUrl: null },
    { id: '55555555-0000-4000-8000-000000000003', categoryId: categories[1].id, name: 'Royal Gel Manicure', description: 'Shape, cuticle care and long-wear gel.', price: 1200, durationMinutes: 75, isActive: true, imageUrl: null },
    { id: '55555555-0000-4000-8000-000000000004', categoryId: categories[1].id, name: 'Signature Pedicure', description: 'Spa soak, exfoliation and polish.', price: 1500, durationMinutes: 90, isActive: true, imageUrl: null },
    { id: '55555555-0000-4000-8000-000000000005', categoryId: categories[2].id, name: 'Glow Facial Treatment', description: 'Gentle cleanse and hydrating facial.', price: 1800, durationMinutes: 90, isActive: true, imageUrl: null },
    { id: '55555555-0000-4000-8000-000000000006', categoryId: categories[2].id, name: 'Aromatherapy Body Spa', description: 'Relaxing full-body aromatherapy treatment.', price: 2500, durationMinutes: 120, isActive: true, imageUrl: null },
  ];
  const appointmentRecords = [
    { offset: 0, time: '09:00', customer: 0, staff: 0, service: 0, status: 'CONFIRMED' as const },
    { offset: 0, time: '11:00', customer: 1, staff: 1, service: 2, status: 'RESERVED' as const },
    { offset: -1, time: '13:30', customer: 2, staff: 2, service: 4, status: 'COMPLETED' as const },
    { offset: 0, time: '15:00', customer: 3, staff: 0, service: 1, status: 'CANCELLED' as const },
    { offset: 2, time: '10:30', customer: 4, staff: 1, service: 3, status: 'RESERVED' as const },
    { offset: -3, time: '14:00', customer: 5, staff: 2, service: 5, status: 'COMPLETED' as const },
    { offset: 5, time: '12:00', customer: 0, staff: 0, service: 0, status: 'CONFIRMED' as const },
    { offset: -8, time: '16:00', customer: 1, staff: 1, service: 2, status: 'NO_SHOW' as const },
    { offset: -12, time: '11:00', customer: 2, staff: 2, service: 1, status: 'COMPLETED' as const },
    { offset: 7, time: '15:30', customer: 3, staff: 1, service: 4, status: 'RESERVED' as const },
  ];
  const appointments: MockAppointment[] = appointmentRecords.map((record, index) => {
    const service = services[record.service];
    const endDate = new Date(`2000-01-01T${record.time}:00`);
    endDate.setMinutes(endDate.getMinutes() + service.durationMinutes);
    return {
      id: `99999999-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      appointmentCode: `RS-${48210 + index}`,
      customerId: customers[record.customer].id,
      staffId: staff[record.staff].id,
      appointmentDate: dateAtOffset(record.offset),
      startTime: record.time,
      endTime: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`,
      totalAmount: service.price,
      status: record.status,
      serviceIds: [service.id],
      createdAt: isoAtOffset(record.offset - 2),
      updatedAt: isoAtOffset(record.offset - 2),
    };
  });
  const paymentStatuses: PaymentStatus[] = ['UNVERIFIED', 'UNVERIFIED', 'VERIFIED', 'REJECTED', 'UNVERIFIED', 'VERIFIED', 'UNVERIFIED', 'REJECTED', 'VERIFIED', 'UNVERIFIED'];
  const payments: MockPayment[] = appointments.map((appointment, index) => {
    const status = paymentStatuses[index];
    const verifiedAt = status === 'VERIFIED'
      ? isoAtOffset(index === 2 ? 0 : -Math.max(1, index))
      : null;
    return {
      id: `66666666-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      appointmentId: appointment.id,
      amount: appointment.totalAmount,
      paymentMethod: index % 3 === 0 ? 'GCASH' : 'CASH',
      status,
      verifiedBy: verifiedAt ? accounts[0].id : null,
      verifiedAt,
      createdAt: appointment.createdAt,
      updatedAt: status === 'REJECTED' ? isoAtOffset(-Math.max(1, index)) : verifiedAt ?? appointment.updatedAt,
    };
  });
  const reviews: MockReview[] = appointments
    .filter((appointment) => appointment.status === 'COMPLETED')
    .map((appointment, index) => ({
      id: `aaaaaaaa-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      rating: [5, 5, 4, 5][index],
      comment: [
        'Elena was wonderful and made the whole visit relaxing.',
        'Beautiful result and a very welcoming team.',
        'Great service. I will definitely book again.',
        'Everything was thoughtful, from the consultation to the finish.',
      ][index],
      createdAt: appointment.createdAt,
    }));
  const schedules: MockSchedule[] = staff.flatMap((member, index) =>
    [index % 7, (index + 1) % 7, (index + 2) % 7, (index + 3) % 7, (index + 4) % 7].map((dayOfWeek, dayIndex) => ({
      id: `${member.id.slice(0, 8)}-0000-4000-8000-${String(index * 5 + dayIndex + 1).padStart(12, '0')}`,
      staffId: member.id,
      dayOfWeek,
      startTime: index === 1 ? '10:00' : '09:00',
      endTime: index === 1 ? '19:00' : '18:00',
      isActive: member.workStatus !== 'UNAVAILABLE',
    })),
  );

  return {
    accounts,
    customers,
    staff,
    categories,
    services,
    appointments,
    payments,
    reviews,
    schedules,
    timeOff: [],
    scheduleRequests: [{ id: 'bbbbbbbb-0000-4000-8000-000000000001', status: 'PENDING' }],
    paymentActivity: [
      { id: 'activity-1', message: 'RS-48212 payment confirmed at the counter.', createdAt: isoAtOffset(0) },
      { id: 'activity-2', message: 'RS-48213 payment rejected — please review the submission.', createdAt: isoAtOffset(-2) },
      { id: 'activity-3', message: 'RS-48214 booking created; payment is due at visit.', createdAt: isoAtOffset(-2) },
    ],
  };
}

function readData(): MockData {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved) as MockData;
      if (!Array.isArray(data.timeOff)) data.timeOff = [];
      return data;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  const data = makeDemoData();
  writeData(data);
  return data;
}

function writeData(data: MockData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ message }, status);
}

function parseBody(init?: RequestInit): Record<string, any> {
  if (typeof init?.body !== 'string') return {};
  try {
    return JSON.parse(init.body) as Record<string, any>;
  } catch {
    return {};
  }
}

function paginated<T>(records: T[], url: URL): { items: T[]; total: number; page: number; limit: number; totalPages: number } {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? 10)));
  const start = (page - 1) * limit;
  return { items: records.slice(start, start + limit), total: records.length, page, limit, totalPages: Math.ceil(records.length / limit) };
}

function requireMockAdmin(request: RequestInfo | URL, init?: RequestInit): Response | null {
  const requestHeaders = request instanceof Request ? request.headers : undefined;
  const headers = new Headers(init?.headers ?? requestHeaders);
  if (headers.get('Authorization') !== `Bearer ${MOCK_TOKEN}`) {
    return errorResponse('Sign in with the development demo administrator to make changes.', 401);
  }
  return null;
}

function accountName(account: MockAccount | undefined): string {
  return account ? `${account.firstName} ${account.lastName}`.trim() : 'Customer';
}

function appointmentInfo(data: MockData, appointment: MockAppointment) {
  const customer = data.customers.find((item) => item.id === appointment.customerId);
  const staff = data.staff.find((item) => item.id === appointment.staffId);
  const customerAccount = data.accounts.find((item) => item.id === customer?.accountId);
  return {
    ...appointment,
    services: appointment.serviceIds.map((serviceId) => {
      const service = data.services.find((item) => item.id === serviceId);
      return { serviceId, serviceName: service?.name ?? 'Salon service', price: service?.price ?? 0, durationMinutes: service?.durationMinutes ?? 0 };
    }),
    customer: customer ? { ...customer, account: customerAccount ? { email: customerAccount.email } : undefined } : null,
    staff: staff ? { id: staff.id, firstName: staff.firstName, lastName: staff.lastName } : null,
  };
}

function paymentInfo(data: MockData, payment: MockPayment) {
  const appointment = data.appointments.find((item) => item.id === payment.appointmentId);
  if (!appointment) return { ...payment, appointment: null, customerName: 'Customer', serviceName: 'Salon service' };
  const customer = data.customers.find((item) => item.id === appointment.customerId);
  const account = data.accounts.find((item) => item.id === customer?.accountId);
  return {
    ...payment,
    appointment: appointmentInfo(data, appointment),
    customerName: accountName(account),
    customerEmail: account?.email ?? '',
    serviceName: appointment.serviceIds.map((id) => data.services.find((service) => service.id === id)?.name ?? 'Salon service').join(', '),
    bookingStatus: appointment.status,
    appointmentCode: appointment.appointmentCode,
    verificationCode: appointment.appointmentCode.replace(/\D/g, '').slice(-5),
  };
}

function mockRequest(input: RequestInfo | URL, init?: RequestInit): Response {
  const requestUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(requestUrl, window.location.origin);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const body = parseBody(init);

  if (path === '/auth/login' && method === 'POST') {
    const account = readData().accounts.find((item) => item.email.toLowerCase() === String(body.email ?? '').toLowerCase());
    const suppliedPassword = String(body.password ?? '');
    const passwordHash = hashString(suppliedPassword);
    if (!account || account.role !== 'ADMIN' || account.status !== 'ACTIVE' || account.passwordHash !== passwordHash) {
      return errorResponse('Invalid development demo credentials.', 401);
    }
    return jsonResponse({ data: { accessToken: MOCK_TOKEN, refreshToken: 'royalty-dev-mock-refresh', account: { id: account.id, email: account.email, role: account.role } } });
  }

  const writeRequest = method !== 'GET' && method !== 'HEAD';
  if (writeRequest) {
    const unauthorized = requireMockAdmin(input, init);
    if (unauthorized) return unauthorized;
  }

  const data = readData();
  if (path === '/accounts' && method === 'GET') {
    const result = paginated(data.accounts, url);
    return jsonResponse({ data: { accounts: result.items, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
  }
  if (path === '/accounts' && method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '').trim();
    const firstName = String(body.firstName ?? '').trim();
    const lastName = String(body.lastName ?? '').trim();
    if (!email || data.accounts.some((account) => account.email.toLowerCase() === email)) return errorResponse('Enter a unique email address.', 409);
    if (!firstName || !lastName || !['MANAGER', 'STAFF'].includes(body.role)) return errorResponse('Enter a first name, last name, and choose a staff or manager role.', 400);
    if (!isValidPassword(password)) return errorResponse('Use a strong temporary password with at least 8 characters, including upper/lowercase, a number, and a special character.', 400);
    const account: MockAccount = {
      id: newId(),
      email,
      firstName,
      lastName,
      role: body.role,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      passwordHash: hashString(password),
      requiresPasswordChange: true,
      passwordChangedAt: null,
    };
    data.accounts.unshift(account);
    const scheduleData = Array.isArray(body.schedule) ? body.schedule : [];
    const staffId = body.role === 'STAFF' ? `33333333-0000-4000-8000-${String(data.accounts.length).padStart(12, '0')}` : null;
    if (staffId) {
      const member: MockStaff = {
        id: staffId,
        accountId: account.id,
        firstName,
        lastName,
        phone: '',
        primaryRole: 'Stylist',
        employmentType: 'FULL_TIME',
        workStatus: 'ON_DUTY',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.staff.push(member);
      for (const entry of scheduleData) {
        data.schedules.push({
          id: newId(),
          staffId,
          dayOfWeek: Number(entry.dayOfWeek),
          startTime: String(entry.startTime),
          endTime: String(entry.endTime),
          isActive: true,
        });
      }
    }
    writeData(data);
    return jsonResponse({ data: { ...account, staffId, schedule: scheduleData } }, 201);
  }
  const accountStatusMatch = path.match(/^\/accounts\/([^/]+)\/status$/);
  if (accountStatusMatch && method === 'PATCH') {
    const account = data.accounts.find((item) => item.id === accountStatusMatch[1]);
    if (!account) return errorResponse('Account not found.', 404);
    if (!['ACTIVE', 'DEACTIVATED'].includes(body.status)) return errorResponse('Invalid account status.', 400);
    account.status = body.status;
    writeData(data);
    return jsonResponse({ data: account });
  }

  if (path === '/staff' && method === 'GET') {
    const today = dateAtOffset(0);
    const staffRows = data.staff.map((member) => ({
      ...member,
      workStatus: data.timeOff.some((entry) => entry.staffId === member.id && entry.startDate <= today && entry.endDate >= today)
        ? 'UNAVAILABLE' as const
        : member.workStatus,
    }));
    const result = paginated(staffRows, url);
    return jsonResponse({ data: { staff: result.items, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
  }
  if (path === '/staff' && method === 'POST') {
    const account = data.accounts.find((item) => item.id === body.accountId && item.role === 'STAFF' && item.status === 'ACTIVE');
    if (!account) return errorResponse('An active staff account is required.', 400);
    if (data.staff.some((member) => member.accountId === account.id)) return errorResponse('This account already has a staff profile.', 409);
    const now = new Date().toISOString();
    const member: MockStaff = {
      id: newId(),
      accountId: account.id,
      firstName: String(body.firstName ?? account.firstName),
      lastName: String(body.lastName ?? account.lastName),
      phone: String(body.phone ?? ''),
      primaryRole: String(body.primaryRole ?? 'Stylist'),
      employmentType: body.employmentType === 'PART_TIME' ? 'PART_TIME' : 'FULL_TIME',
      workStatus: ['ON_DUTY', 'DAY_OFF', 'UNAVAILABLE'].includes(body.workStatus) ? body.workStatus : 'DAY_OFF',
      createdAt: now,
      updatedAt: now,
    };
    data.staff.push(member);
    writeData(data);
    return jsonResponse({ data: member }, 201);
  }
  const staffMatch = path.match(/^\/staff\/([^/]+)$/);
  if (staffMatch && method === 'PATCH') {
    const member = data.staff.find((item) => item.id === staffMatch[1]);
    if (!member) return errorResponse('Staff profile not found.', 404);
    if (body.lastName !== undefined) member.lastName = String(body.lastName).trim();
    if (body.phone !== undefined) member.phone = String(body.phone).trim();
    if (body.primaryRole !== undefined) member.primaryRole = String(body.primaryRole);
    if (body.employmentType !== undefined) member.employmentType = body.employmentType === 'PART_TIME' ? 'PART_TIME' : 'FULL_TIME';
    if (body.workStatus !== undefined && ['ON_DUTY', 'DAY_OFF', 'UNAVAILABLE'].includes(body.workStatus)) member.workStatus = body.workStatus;
    member.updatedAt = new Date().toISOString();
    writeData(data);
    return jsonResponse({ data: member });
  }
  const staffTimeOffMatch = path.match(/^\/staff\/([^/]+)\/time-off$/);
  if (staffTimeOffMatch && method === 'GET') {
    const staffId = staffTimeOffMatch[1];
    if (!data.staff.some((member) => member.id === staffId)) return errorResponse('Staff profile not found.', 404);
    return jsonResponse({ data: { timeOff: data.timeOff.filter((entry) => entry.staffId === staffId).sort((a, b) => a.startDate.localeCompare(b.startDate)) } });
  }
  if (staffTimeOffMatch && method === 'POST') {
    const staffId = staffTimeOffMatch[1];
    if (!data.staff.some((member) => member.id === staffId)) return errorResponse('Staff profile not found.', 404);
    const type = body.type;
    const startDate = String(body.startDate ?? '');
    const endDate = String(body.endDate ?? '');
    const startTime = body.startTime ? String(body.startTime) : null;
    const endTime = body.endTime ? String(body.endTime) : null;
    if (!['VACATION', 'DAY_OFF'].includes(type) || !isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
      return errorResponse('Choose a valid type and date range.', 400);
    }
    if (!isValidTimeRange(startTime, endTime)) {
      return errorResponse('Choose a valid start and end time.', 400);
    }
    const entry: MockTimeOff = { id: newId(), staffId, type, startDate, endDate, startTime, endTime, createdAt: new Date().toISOString() };
    data.timeOff.push(entry);
    writeData(data);
    return jsonResponse({ data: { timeOff: entry } }, 201);
  }
  const staffTimeOffItemMatch = path.match(/^\/staff\/([^/]+)\/time-off\/([^/]+)$/);
  if (staffTimeOffItemMatch && method === 'PATCH') {
    const entry = data.timeOff.find((item) => item.staffId === staffTimeOffItemMatch[1] && item.id === staffTimeOffItemMatch[2]);
    if (!entry) return errorResponse('Time-off entry not found.', 404);
    const startDate = String(body.startDate ?? entry.startDate);
    const endDate = String(body.endDate ?? entry.endDate);
    const startTime = body.startTime === undefined ? entry.startTime : body.startTime ? String(body.startTime) : null;
    const endTime = body.endTime === undefined ? entry.endTime : body.endTime ? String(body.endTime) : null;
    if (body.type !== undefined && !['VACATION', 'DAY_OFF'].includes(body.type)) return errorResponse('Choose a valid time-off type.', 400);
    if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) return errorResponse('Choose a valid date range.', 400);
    if (!isValidTimeRange(startTime, endTime)) return errorResponse('Choose a valid time range.', 400);
    entry.type = body.type ?? entry.type;
    entry.startDate = startDate;
    entry.endDate = endDate;
    entry.startTime = startTime;
    entry.endTime = endTime;
    writeData(data);
    return jsonResponse({ data: { timeOff: entry } });
  }
  if (staffTimeOffItemMatch && method === 'DELETE') {
    const entryIndex = data.timeOff.findIndex((entry) => entry.staffId === staffTimeOffItemMatch[1] && entry.id === staffTimeOffItemMatch[2]);
    if (entryIndex < 0) return errorResponse('Time-off entry not found.', 404);
    const [removed] = data.timeOff.splice(entryIndex, 1);
    writeData(data);
    return jsonResponse({ data: { timeOff: removed } });
  }

  if (path === '/schedules/staff' && method === 'GET') return jsonResponse({ data: { staffSchedules: data.schedules } });
  const staffScheduleMatch = path.match(/^\/schedules\/staff\/([^/]+)$/);
  if (staffScheduleMatch && method === 'PATCH') {
    const staffId = staffScheduleMatch[1];
    if (!data.staff.some((member) => member.id === staffId)) return errorResponse('Staff profile not found.', 404);
    const scheduleData = Array.isArray(body.schedule) ? body.schedule : [];
    const staffSchedule = data.schedules.filter((s) => s.staffId === staffId);
    const updated: any[] = [];
    for (const entry of scheduleData) {
      const dayOfWeek = Number(entry.dayOfWeek);
      const startTime = String(entry.startTime);
      const endTime = String(entry.endTime);
      const existing = staffSchedule.find((s) => s.dayOfWeek === dayOfWeek);
      if (existing) {
        existing.startTime = startTime;
        existing.endTime = endTime;
        existing.isActive = true;
        updated.push(existing);
      } else {
        const newEntry = { id: newId(), staffId, dayOfWeek, startTime, endTime, isActive: true };
        data.schedules.push(newEntry);
        updated.push(newEntry);
      }
    }
    data.schedules = data.schedules.filter((s) => s.staffId !== staffId || scheduleData.some((e: any) => Number(e.dayOfWeek) === s.dayOfWeek));
    writeData(data);
    return jsonResponse({ data: { staffSchedules: updated } });
  }
  if (path === '/schedules/requests' && method === 'GET') return jsonResponse({ data: { scheduleRequests: data.scheduleRequests } });

  if (path === '/appointments' && method === 'GET') {
    const records = [...data.appointments]
      .sort((left, right) => `${right.appointmentDate}T${right.startTime}`.localeCompare(`${left.appointmentDate}T${left.startTime}`))
      .map((appointment) => appointmentInfo(data, appointment));
    const result = paginated(records, url);
    return jsonResponse({ data: { appointments: result.items, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
  }
  const appointmentStatusMatch = path.match(/^\/appointments\/([^/]+)\/status$/);
  if (appointmentStatusMatch && method === 'PATCH') {
    const appointment = data.appointments.find((item) => item.id === appointmentStatusMatch[1]);
    if (!appointment) return errorResponse('Appointment not found.', 404);
    const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      RESERVED: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
      COMPLETED: [],
      CANCELLED: [],
      NO_SHOW: [],
    };
    if (!transitions[appointment.status].includes(body.status)) return errorResponse(`Cannot change an appointment from ${appointment.status.toLowerCase()} to ${String(body.status).toLowerCase()}.`, 400);
    if ((body.status === 'NO_SHOW' || body.status === 'COMPLETED') && `${appointment.appointmentDate}T${appointment.endTime}` > new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).replace(' ', 'T').slice(0, 16)) {
      return errorResponse(body.status === 'NO_SHOW'
        ? 'An appointment can only be marked no-show after its scheduled time.'
        : 'An appointment can only be completed after its scheduled end time.', 400);
    }
    appointment.status = body.status;
    appointment.updatedAt = new Date().toISOString();
    writeData(data);
    return jsonResponse({ data: { appointment } });
  }

  if (path === '/payments' && method === 'GET') {
    let records = [...data.payments];
    const status = url.searchParams.get('status');
    if (status) records = records.filter((payment) => payment.status === status);
    records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const result = paginated(records.map((payment) => paymentInfo(data, payment)), url);
    return jsonResponse({ data: { payments: result.items, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
  }
  const paymentStatusMatch = path.match(/^\/payments\/([^/]+)\/status$/);
  if (paymentStatusMatch && method === 'PATCH') {
    const payment = data.payments.find((item) => item.id === paymentStatusMatch[1]);
    if (!payment) return errorResponse('Payment not found.', 404);
    if (payment.status !== 'UNVERIFIED' || !['VERIFIED', 'REJECTED'].includes(body.status)) {
      return errorResponse('Only pending payments may be verified or rejected.', 400);
    }
    payment.status = body.status;
    payment.verifiedBy = data.accounts.find((account) => account.role === 'ADMIN')?.id ?? null;
    payment.verifiedAt = new Date().toISOString();
    payment.updatedAt = payment.verifiedAt;
    const appointment = data.appointments.find((item) => item.id === payment.appointmentId);
    const action = body.status === 'VERIFIED' ? 'confirmed' : 'rejected';
    data.paymentActivity.unshift({
      id: newId(),
      message: `${appointment?.appointmentCode ?? 'Payment'} ${action} by the development demo administrator.`,
      createdAt: payment.verifiedAt,
    });
    writeData(data);
    return jsonResponse({ data: { payment: paymentInfo(data, payment) } });
  }
  if (path === '/payments/activity' && method === 'GET') {
    return jsonResponse({ data: { activities: data.paymentActivity } });
  }

  if (path === '/reviews' && method === 'GET') {
    const records = data.reviews
      .map((review) => {
        const appointment = data.appointments.find((item) => item.id === review.appointmentId);
        const customer = data.customers.find((item) => item.id === review.customerId);
        const account = data.accounts.find((item) => item.id === customer?.accountId);
        return { ...review, customer: accountName(account), appointment: appointment ? appointmentInfo(data, appointment) : null };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const result = paginated(records, url);
    return jsonResponse({ data: { reviews: result.items, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
  }

  if (path === '/services/categories' && method === 'GET') {
    const categories = data.categories.map((category) => ({ ...category }));
    return jsonResponse({ data: { categories } });
  }
  if (path === '/services/categories' && method === 'POST') {
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 100) return errorResponse('Enter a category name of 1 to 100 characters.', 400);
    if (data.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) return errorResponse('A service category with this name already exists.', 409);
    const category = { id: newId(), name, isActive: true };
    data.categories.push(category);
    writeData(data);
    return jsonResponse({ data: { category } }, 201);
  }
  const categoryMatch = path.match(/^\/services\/categories\/([^/]+)$/);
  if (categoryMatch && method === 'PATCH') {
    const category = data.categories.find((item) => item.id === categoryMatch[1]);
    if (!category) return errorResponse('Service category not found.', 404);
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 100) return errorResponse('Enter a category name of 1 to 100 characters.', 400);
      if (data.categories.some((item) => item.id !== category.id && item.name.toLowerCase() === name.toLowerCase())) return errorResponse('A service category with this name already exists.', 409);
      category.name = name;
    }
    if (body.isActive !== undefined) category.isActive = Boolean(body.isActive);
    writeData(data);
    return jsonResponse({ data: { category } });
  }
  if (path === '/services' && method === 'GET') {
    const services = data.services.map((service) => ({
      ...service,
      categoryName: data.categories.find((category) => category.id === service.categoryId)?.name ?? 'Unknown',
    }));
    return jsonResponse({ data: { services } });
  }
  if (path === '/services' && method === 'POST') {
    const categoryId = String(body.categoryId ?? '');
    const name = String(body.name ?? '').trim();
    const category = data.categories.find((item) => item.id === categoryId);
    const price = Number(body.price);
    const durationMinutes = Number(body.durationMinutes);
    const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl ? body.imageUrl : null;
    if (!category || !category.isActive) return errorResponse('Choose an active service category.', 400);
    if (!name || name.length > 200 || !Number.isFinite(price) || price <= 0 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) {
      return errorResponse('Enter a name, positive price, and duration between 1 and 300 minutes.', 400);
    }
    if (data.services.some((item) => item.categoryId === categoryId && item.name.toLowerCase() === name.toLowerCase())) return errorResponse('A service with this name already exists in this category.', 409);
    const now = new Date().toISOString();
    const service: MockService = { id: newId(), categoryId, name, description: String(body.description ?? ''), price, durationMinutes, isActive: true, imageUrl };
    data.services.push(service);
    writeData(data);
    return jsonResponse({ data: { service: { ...service, categoryName: category.name, createdAt: now, updatedAt: now } } }, 201);
  }
  const serviceMatch = path.match(/^\/services\/([^/]+)$/);
  if (serviceMatch && method === 'PATCH') {
    const service = data.services.find((item) => item.id === serviceMatch[1]);
    if (!service) return errorResponse('Service not found.', 404);
    const categoryId = String(body.categoryId ?? service.categoryId);
    const category = data.categories.find((item) => item.id === categoryId);
    const name = String(body.name ?? service.name).trim();
    const price = body.price === undefined ? service.price : Number(body.price);
    const durationMinutes = body.durationMinutes === undefined ? service.durationMinutes : Number(body.durationMinutes);
    if (!category || (categoryId !== service.categoryId && !category.isActive)) return errorResponse('Choose an active service category.', 400);
    if (!name || name.length > 200 || !Number.isFinite(price) || price <= 0 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) {
      return errorResponse('Enter a name, positive price, and duration between 1 and 300 minutes.', 400);
    }
    if (data.services.some((item) => item.id !== service.id && item.categoryId === categoryId && item.name.toLowerCase() === name.toLowerCase())) return errorResponse('A service with this name already exists in this category.', 409);
    service.categoryId = categoryId;
    service.name = name;
    if (body.description !== undefined) service.description = String(body.description);
    if (body.imageUrl !== undefined) service.imageUrl = body.imageUrl ? String(body.imageUrl) : null;
    service.price = price;
    service.durationMinutes = durationMinutes;
    if (body.isActive !== undefined) service.isActive = Boolean(body.isActive);
    writeData(data);
    return jsonResponse({ data: { service: { ...service, categoryName: category.name } } });
  }

  return errorResponse(`No development mock endpoint for ${method} ${path}.`, 404);
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!mockApiEnabled) return fetch(input, init);
  return Promise.resolve(mockRequest(input, init));
}

export function resetMockData(): void {
  if (!mockApiEnabled) return;
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}
