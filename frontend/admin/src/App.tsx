import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, authHeader, clearAccessTokens, generateTemporaryPassword, getAccessToken, storeAccessTokens } from './api';
import {
  accountEmailError,
  DURATION_MESSAGE,
  POSITIVE_AMOUNT_MESSAGE,
  TIME_RANGE_MESSAGE,
  EMAIL_MESSAGE,
  isValidAmount,
  isValidDuration,
  isValidEmail,
  isValidPassword,
  isValidPersonName,
  isValidPhilippineMobile,
  isValidTimeRange,
  PASSWORD_MATCH_MESSAGE,
  PASSWORD_MESSAGE,
  personNameMessage,
  PHONE_MESSAGE,
  passwordsMatch,
} from './shared/validation';
import { ThemeProvider } from './theme';
import { ThemeSwitch } from './components/ThemeSwitch';
import { SignOutControl } from './components/SignOutControl';
import { BrandShowcase } from './components/BrandShowcase';
import { SidebarStatusPanel } from './components/SidebarStatusPanel';
import { CalendarSkeleton, ChartSkeleton, FieldError, invalidField, ListSkeleton, Skeleton, SkeletonRegion, StatCardSkeleton, TableSkeleton } from './shared/ui';
import { CategoryBars, DataOriginNote, LineChart, type LineAxisPoint, type LineSeries } from './components/charts';
import { AccountsIcon, AttendanceIcon, CalendarIcon, DashboardIcon, PaymentsIcon, StaffIcon } from './components/icons';
import { useDialogBehavior } from './components/useDialogBehavior';
import { clearAccountSession, currentSession, readLoginSession, storeAccountSession, type AccountRole } from './session';
import { ImageUploadField, type ImageUploadHandle } from './shared/imageUpload';
import { CheckboxMultiSelect, TagMultiSelect, ToggleSwitch } from './shared/profileFields';
import { AttendancePanel } from './attendance/AttendancePanel';
import { StaffShell } from './staff/StaffShell';
import { StaffOverviewPanel } from './staff/StaffOverviewPanel';
import { StaffAppointmentsPanel } from './staff/StaffAppointmentsPanel';
import { StaffSchedulePanel } from './staff/StaffSchedulePanel';
import { StaffServicesPanel } from './staff/StaffServicesPanel';
import { StaffProfilePanel } from './staff/StaffProfilePanel';
import { StaffCredentialsPanel, issueStaffPassword, type StaffCredentials } from './staff/StaffCredentialsPanel';

type Review = {
  id: string;
  customer: string;
  rating: number;
  date: string;
  text: string;
};

type TableRow = {
  id: string;
  accountId?: string;
  user: string;
  email: string;
  role: string;
  status: 'Active' | 'Deactivated' | 'On Vacation';
  lastLogin: string;
  action?: string;
};

type StaffRow = {
  id?: string;
  accountId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  user: string;
  email: string;
  role: string;
  employment: string;
  schedule: string;
  /** Job title shown on the profile and the team page. */
  position?: string;
  /** A short biography shown on the team page. */
  bio?: string;
  /** Roles this staff member may cover. */
  coveredRoles?: string[];
  /** Whether the profile is listed on the team page. */
  showOnTeam?: boolean;
  /** Service categories this staff member performs (category ids). */
  specialties?: string[];
  /** The uploaded staff photo, when one has been stored. */
  photoUrl?: string | null;
  /**
   * Account access: whether the account may sign in.
   * Availability below is a separate concern and never implies access.
   */
  accountStatus: 'Active' | 'Deactivated';
  /** Availability: whether the staff member is working, off, or unavailable. */
  status: 'Active' | 'On Vacation' | 'Day Off';
};

type AppointmentRow = {
  id?: string;
  code: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  serviceNames: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  staffName?: string;
  totalAmount?: number;
};

const navSections = [
  {
    label: 'Overview',
    items: [
      { label: 'Business Dashboard', to: '/', Icon: DashboardIcon },
      { label: 'Appointments & Calendar', to: '/appointments', Icon: CalendarIcon },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Account Management', to: '/accounts', Icon: AccountsIcon },
      { label: 'Staff Management', to: '/staff', Icon: StaffIcon },
      { label: 'Attendance', to: '/attendance', Icon: AttendanceIcon },
      { label: 'Payments & Verification', to: '/payments', Icon: PaymentsIcon },
    ],
  },
];

/**
 * The roles vocabulary the interface already offers for salon staff: the role
 * labels used across the staff directory and the account roles offered when an
 * account is created. Covered roles are picked from this list, and a role that
 * is not listed can still be added as a custom tag.
 */
const COVERED_ROLE_VOCABULARY = ['Stylist', 'Senior Stylist', 'Nail Tech', 'Manager', 'Staff'];

const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const APPOINTMENT_STATUS_TEXT: Record<string, string> = {
  RESERVED: 'Reserved',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No show',
};

const SIDEBAR_STATUS_ORDER = ['CONFIRMED', 'RESERVED', 'NO_SHOW', 'COMPLETED', 'CANCELLED'] as const;

const APPOINTMENT_STATUS_BADGE: Record<string, string> = {
  CONFIRMED: 'status-confirmed',
  RESERVED: 'status-reserved',
  NO_SHOW: 'status-noshow',
  COMPLETED: 'status-completed',
  CANCELLED: 'status-cancelled',
};

function appointmentStatusText(status: string): string {
  return APPOINTMENT_STATUS_TEXT[status] ?? String(status).replace('_', ' ').toLowerCase();
}

/**
 * The chart colour for each appointment state.
 *
 * Each token is the solid version of the hue the matching status badge
 * already uses, so a bar and a badge read as the same state wherever they
 * appear. The badge is a soft tint of the colour; the bar is that colour
 * at full strength.
 */
const APPOINTMENT_CHART_COLOR: Record<string, string> = {
  CONFIRMED: 'confirmed',
  RESERVED: 'reserved',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'noshow',
};

/** A calendar date as "Oct 22", for naming a period on a chart. */
/** A request date, shown as a readable calendar date. */
function formatRequestDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function appointmentStatusBadge(status: string): string {
  return APPOINTMENT_STATUS_BADGE[status] ?? 'status-noshow';
}

function isPastNonterminal(appointment: { appointmentDate: string; status: string }, todayKey: string): boolean {
  return appointment.appointmentDate < todayKey && (appointment.status === 'CONFIRMED' || appointment.status === 'RESERVED');
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeWeeklySchedule(days: any[] = []): Array<{ dayOfWeek: number; enabled: boolean; startTime: string; endTime: string }> {
  const normalized = Array.from({ length: 7 }, (_, index) => ({
    dayOfWeek: index + 1,
    enabled: false,
    startTime: '09:00',
    endTime: '17:00',
  }));

  for (const entry of days) {
    const dayOfWeek = Number(entry?.dayOfWeek ?? 0);
    if (dayOfWeek >= 1 && dayOfWeek <= 7) {
      normalized[dayOfWeek - 1] = {
        dayOfWeek,
        enabled: entry?.isActive ?? entry?.enabled ?? true,
        startTime: String(entry?.startTime ?? '09:00'),
        endTime: String(entry?.endTime ?? '17:00'),
      };
    }
  }

  return normalized;
}

function summarizeSchedule(days: Array<{ dayOfWeek: number; enabled: boolean; startTime: string; endTime: string }>) {
  const active = days.filter((day) => day.enabled);
  if (!active.length) return 'No recurring schedule';
  return active.map((day) => `${weekDayLabels[day.dayOfWeek - 1]} ${day.startTime}-${day.endTime}`).join(' · ');
}

/**
 * The category ids of a staff member's specialties.
 *
 * The API returns them either as plain ids or as staff-category rows; both
 * shapes name the service category the staff member performs.
 */
function staffSpecialtyIds(staff: any): string[] {
  const rows = Array.isArray(staff?.specialties)
    ? staff.specialties
    : Array.isArray(staff?.staffCategories)
      ? staff.staffCategories
      : [];
  return rows
    .map((entry: any) => String(entry?.categoryId ?? entry?.category?.id ?? entry?.id ?? (typeof entry === 'string' ? entry : '')))
    .filter((id: string) => id.length > 0);
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AdminArea />}>
            <Route index element={<BusinessDashboardPage />} />
            <Route path="services" element={<ServiceManagementPage />} />
            <Route path="accounts" element={<AccountManagementPage />} />
            <Route path="staff" element={<StaffManagementPage />} />
            <Route path="attendance" element={<AttendancePanel />} />
            <Route path="appointments" element={<AppointmentPage />} />
            <Route path="payments" element={<PaymentPage />} />
          </Route>
          <Route path="/my" element={<StaffArea />}>
            <Route index element={<StaffOverviewPanel />} />
            <Route path="appointments" element={<StaffAppointmentsPanel />} />
            <Route path="schedule" element={<StaffSchedulePanel />} />
            <Route path="services" element={<StaffServicesPanel />} />
            <Route path="attendance" element={<AttendancePanel />} />
            <Route path="profile" element={<StaffProfilePanel />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

/**
 * The administrator area.
 *
 * A staff session is sent to its own area rather than shown administrator
 * pages. The API enforces the same boundary, so hiding the pages here is a
 * convenience and not the control.
 */
function AdminArea() {
  const session = currentSession(getAccessToken());
  if (session?.role === 'STAFF') return <Navigate to="/my" replace />;
  return <Shell />;
}

/**
 * The staff area.
 *
 * A session that is not a staff member is sent to the administrator area.
 */
function StaffArea() {
  const session = currentSession(getAccessToken());
  if (session && session.role !== 'STAFF') return <Navigate to="/" replace />;
  return <StaffShell />;
}

function useReviewData() {
  const [data, setData] = useState<Review[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const token = getAccessToken();

    apiFetch(`${baseUrl}/reviews?page=1&limit=3`, {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Unavailable');
        return res.json();
      })
      .then((payload) => {
        const records = payload?.data?.reviews ?? [];
        if (Array.isArray(records) && records.length > 0) {
          const mapped = records.map((item: any) => ({
            id: String(item.id ?? item.appointment?.id ?? ''),
            customer: item.customer ?? item.customerName ?? 'Verified Customer',
            rating: Number(item.rating ?? 5),
            date: item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent',
            text: item.comment || 'Customer review',
          }));
          setData(mapped);
        }
      })
      .catch(() => setData([]));

    return () => controller.abort();
  }, []);

  return data;
}

type LoadState = 'loading' | 'ready' | 'error';

function useAccountData() {
  const [data, setData] = useState<TableRow[]>([]);
  const [status, setStatus] = useState<LoadState>('loading');

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setStatus('error');
      return;
    }

    const controller = new AbortController();
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

    apiFetch(`${baseUrl}/accounts?page=1&limit=100`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Unavailable');
        return res.json();
      })
      .then((payload) => {
        const records = payload?.data?.accounts ?? payload?.data ?? [];
        if (Array.isArray(records)) {
          const mapped: TableRow[] = records.map((account: any) => ({
            id: String(account.email ?? 'AC').slice(0, 2).toUpperCase(),
            accountId: String(account.id ?? ''),
            user: `${account.firstName ?? ''} ${account.lastName ?? ''}`.trim() || String(account.email ?? 'Account').split('@')[0],
            email: account.email ?? 'unknown@example.com',
            role: ({ ADMIN: 'Super Admin', MANAGER: 'Manager', STAFF: 'Staff', CUSTOMER: 'Customer' } as Record<string, string>)[account.role] ?? account.role ?? 'Staff',
            status: (account.status === 'DEACTIVATED' ? 'Deactivated' : 'Active') as TableRow['status'],
            lastLogin: account.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'Not tracked',
          }));
          setData(mapped);
        }
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData([]);
          setStatus('error');
        }
      });

    return () => controller.abort();
  }, []);

  return [data, setData, status] as const;
}

function useStaffData() {
  const [data, setData] = useState<StaffRow[]>([]);
  const [status, setStatus] = useState<LoadState>('loading');

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setStatus('error');
      return;
    }
    const controller = new AbortController();
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      apiFetch(`${baseUrl}/staff?page=1&limit=100`, { signal: controller.signal, headers }),
      apiFetch(`${baseUrl}/accounts?page=1&limit=100`, { signal: controller.signal, headers }),
      apiFetch(`${baseUrl}/schedules/staff`, { signal: controller.signal, headers }),
    ])
      .then(async ([staffResponse, accountResponse, scheduleResponse]) => {
        if (!staffResponse.ok) throw new Error('Unable to load staff directory.');
        const staffPayload = await staffResponse.json();
        const accountPayload = accountResponse.ok ? await accountResponse.json() : { data: { accounts: [] } };
        const schedulePayload = scheduleResponse.ok ? await scheduleResponse.json() : { data: { staffSchedules: [] } };
        const emails = new Map((accountPayload?.data?.accounts ?? []).map((account: any) => [account.id, account.email]));
        // The account status is read from the account row, separately from the
        // staff work status. A deactivated account blocks sign-in; a day off
        // does not.
        const accountStatuses = new Map((accountPayload?.data?.accounts ?? []).map((account: any) => [account.id, account.status]));
        const schedules = new Map<string, any[]>();
        for (const schedule of schedulePayload?.data?.staffSchedules ?? []) {
          const current = schedules.get(schedule.staffId) ?? [];
          schedules.set(schedule.staffId, [...current, schedule]);
        }
        const records = staffPayload?.data?.staff ?? [];
        setData(records.map((staff: any) => ({
          id: String(staff.id),
          accountId: String(staff.accountId),
          firstName: String(staff.firstName ?? ''),
          lastName: String(staff.lastName ?? ''),
          phone: String(staff.phone ?? ''),
          user: `${staff.firstName} ${staff.lastName}`.trim(),
          email: emails.get(staff.accountId) ?? 'Email not available',
          role: staff.primaryRole,
          employment: staff.employmentType === 'PART_TIME' ? 'Part Time' : 'Full Time',
          position: String(staff.position ?? ''),
          bio: String(staff.bio ?? ''),
          coveredRoles: Array.isArray(staff.coveredRoles) ? staff.coveredRoles.map((role: unknown) => String(role)) : [],
          showOnTeam: Boolean(staff.showOnTeam),
          specialties: staffSpecialtyIds(staff),
          photoUrl: (staff.photoUrl ?? staff.photo ?? null) as string | null,
          schedule: (schedules.get(staff.id) ?? []).filter((schedule) => schedule.isActive).sort((left, right) => left.dayOfWeek - right.dayOfWeek).map((schedule) => {
            const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][schedule.dayOfWeek - 1] ?? '';
            const formatTime = (time: string) => {
              const [hour, minute] = time.split(':').map(Number);
              return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour >= 12 ? 'PM' : 'AM'}`;
            };
            // A non-breaking hyphen keeps a time range together when the schedule
            // wraps onto a second line, instead of splitting "9AM-" from "6PM".
            return `${day || (schedule.dayOfWeek === 0 ? 'Sun' : '')}, ${formatTime(schedule.startTime)}\u2011${formatTime(schedule.endTime)}`;
          }).join(' · ') || 'No schedule assigned',
          accountStatus: (accountStatuses.get(staff.accountId) === 'DEACTIVATED' ? 'Deactivated' : 'Active') as StaffRow['accountStatus'],
          status: staff.workStatus === 'ON_DUTY' ? 'Active' : staff.workStatus === 'UNAVAILABLE' ? 'On Vacation' : 'Day Off',
        })));
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData([]);
          setStatus('error');
        }
      });

    return () => controller.abort();
  }, []);

  return [data, setData, status] as const;
}

function useAppointmentData() {
  const [data, setData] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    const controller = new AbortController();
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    apiFetch(`${baseUrl}/appointments?page=1&limit=100`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? 'Unable to load appointments.');
        setData((payload?.data?.appointments ?? []).map((appointment: any) => ({
          id: String(appointment.id),
          code: appointment.appointmentCode ?? String(appointment.id).slice(0, 8),
          appointmentDate: appointment.appointmentDate,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          status: appointment.status,
          serviceNames: appointment.services?.map((service: any) => service.serviceName).join(', ') || 'Salon appointment',
          customerName: `${appointment.customer?.firstName ?? ''} ${appointment.customer?.lastName ?? ''}`.trim() || 'Customer',
          customerEmail: appointment.customer?.account?.email ?? '',
          customerPhone: appointment.customer?.phone ?? '',
          staffName: `${appointment.staff?.firstName ?? ''} ${appointment.staff?.lastName ?? ''}`.trim() || 'Staff not assigned',
          totalAmount: Number(appointment.totalAmount ?? 0),
        })));
      })
      .catch(() => {
        if (!controller.signal.aborted) setData([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return [data, setData, loading] as const;
}

function Shell() {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getAccessToken()));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavToggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
        mobileNavToggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  const pageTitle = useMemo(() => {
    if (location.pathname === '/accounts') return 'Authentication & Account Management';
    if (location.pathname === '/staff') return 'Staff Directory & Performance';
    if (/^\/staff\/[^/]+\/edit$/.test(location.pathname)) return 'Edit Staff Account';
    if (location.pathname === '/attendance') return 'Staff Attendance';
    if (location.pathname === '/appointments') return 'Appointment Management';
    if (location.pathname === '/payments') return 'Payments & Verification';
    if (location.pathname === '/services') return 'Service Management';
    return 'Business Dashboard';
  }, [location.pathname]);

  if (!isAuthenticated) {
    return <LoginPage onLogin={(role) => {
      setIsAuthenticated(true);
      // A staff member opens the staff dashboard; an administrator opens the
      // business dashboard. The reload re-reads the stored session.
      if (role === 'STAFF') {
        window.location.assign('/my');
        return;
      }
      window.location.reload();
    }} />;
  }

  return (
    <div className="page-bg">
      <div className="viewer-shell">
        <button
          ref={mobileNavToggleRef}
          type="button"
          className="mobile-nav-toggle"
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen}
          aria-controls="primary-navigation"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <aside className={`sidebar${mobileNavOpen ? ' mobile-open' : ''}`}>
          <div className="brand-wrap sidebar-brand">
            <div className="brand-mark" aria-hidden="true"><img src="/images/Logo.jpg" alt="" /></div>
            <div>
              <h1>ROYALTY SALON</h1>
              <p>ADMIN PANEL</p>
            </div>
          </div>
          <nav className="nav" id="primary-navigation" aria-label="Main navigation">
            {navSections.map((section) => (
              <div key={section.label}>
                <p className="nav-section">{section.label}</p>
                {section.items.map(({ label, to, Icon }) => (
                  <NavLink key={label} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={() => setMobileNavOpen(false)}>
                    <span className="nav-icon" aria-hidden="true"><Icon /></span>
                    {label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <SidebarStatusPanel />
          <SignOutControl
            label="Signed in"
            initials="SA"
            onSignOut={() => {
              clearAccessTokens();
              clearAccountSession();
              setIsAuthenticated(false);
              window.location.reload();
            }}
          />
        </aside>

        <main className="content-panel">
          <section className="page-header">
            <div>
              <p className="page-eyebrow">Royalty Salon</p>
              <h2>{pageTitle}</h2>
              <p>
                {location.pathname === '/accounts'
                  ? 'Manage role-based access, create staff accounts, and view audit activity.'
                  : location.pathname === '/staff'
                    ? 'View all professional staff, metrics, and current schedules.'
                    : location.pathname === '/attendance'
                      ? 'Record time in and time out, and correct attendance records.'
                      : location.pathname === '/appointments'
                      ? 'Track appointments, slot availability, and customer confirmations.'
                      : location.pathname === '/payments'
                        ? 'Review transaction activity, verify payments, and manage submissions.'
                        : location.pathname === '/services'
                          ? 'Manage service categories, pricing, and availability.'
                        : 'Overview of bookings, revenue, and customer insights.'}
              </p>
            </div>
            <div className="page-header-actions">
              <ThemeSwitch />
            </div>
          </section>


          {(location.pathname === '/' || location.pathname === '/services') && (
            <nav className="dashboard-tabs" aria-label="Dashboard sections">
              <NavLink to="/" end className={({ isActive }) => `dashboard-tab${isActive ? ' active' : ''}`}>Overview</NavLink>
              <NavLink to="/services" className={({ isActive }) => `dashboard-tab${isActive ? ' active' : ''}`}>Service Management</NavLink>
            </nav>
          )}

          <div className="route-content">
            <Outlet />
          </div>
        </main>
      </div>

    </div>
  );
}

function BusinessDashboardPage() {
  const reviewData = useReviewData();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [appointmentsAvailable, setAppointmentsAvailable] = useState(false);
  const [paymentsAvailable, setPaymentsAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long' }).toUpperCase();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const controller = new AbortController();
    Promise.all([
      apiFetch(`${baseUrl}/appointments?page=1&limit=100`, { signal: controller.signal, headers }),
      apiFetch(`${baseUrl}/payments?page=1&limit=100`, { signal: controller.signal, headers }),
    ])
      .then(async ([appointmentResponse, paymentResponse]) => {
        const [appointmentPayload, paymentPayload] = await Promise.all([appointmentResponse.json(), paymentResponse.json()]);
        if (appointmentResponse.ok) {
          setAppointments(appointmentPayload?.data?.appointments ?? []);
          setAppointmentsAvailable(true);
        }
        if (paymentResponse.ok) {
          setPayments(paymentPayload?.data?.payments ?? []);
          setPaymentsAvailable(true);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const startOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const monthAppointments = appointments.filter((item) => item.appointmentDate >= startOfMonth && item.appointmentDate.slice(0, 7) === todayKey.slice(0, 7));
  const verifiedPayments = payments.filter((payment) => payment.status === 'VERIFIED');
  const averageRating = reviewData.length ? (reviewData.reduce((total, review) => total + review.rating, 0) / reviewData.length).toFixed(1) : '—';
  const dashboardMetrics = [
    // A cancelled appointment is not a booking, so it is left out of the
    // count. This keeps the figure in step with today's schedule in the
    // sidebar, which lists the bookings that are still going ahead.
    { label: "TODAY'S BOOKINGS", value: appointmentsAvailable ? appointments.filter((item) => item.appointmentDate === todayKey && item.status !== 'CANCELLED').length : '—', suffix: 'EXCL. CANCELLED' },
    { label: 'TOTAL APPOINTMENTS', value: appointmentsAvailable ? monthAppointments.length : '—', suffix: monthLabel },
    { label: 'COMPLETED', value: appointmentsAvailable ? monthAppointments.filter((item) => item.status === 'COMPLETED').length : '—', suffix: monthLabel },
    { label: 'CANCELLED', value: appointmentsAvailable ? monthAppointments.filter((item) => item.status === 'CANCELLED').length : '—', suffix: monthLabel },
    { label: 'REVENUE', value: paymentsAvailable ? `₱${verifiedPayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0).toLocaleString()}` : '—', suffix: paymentsAvailable ? 'VERIFIED' : 'NOT CONNECTED' },
    { label: 'AVG RATINGS', value: averageRating, suffix: 'RECENT REVIEWS' },
  ];
  // One point per day, read from the appointment records. The axis carries
  // the calendar date so the tooltip can name the day it belongs to.
  const bookingAxis: LineAxisPoint[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      fullLabel: date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    };
  });
  const bookingSeries: LineSeries[] = [{
    key: 'appointments',
    label: 'Appointments',
    color: '--chart-fill',
    values: Object.fromEntries(bookingAxis.map((point) => [
      point.key,
      appointments.filter((item) => item.appointmentDate === point.key).length,
    ])),
  }];
  const topServices = new Map<string, number>();
  for (const appointment of monthAppointments) {
    for (const service of appointment.services ?? []) {
      topServices.set(service.serviceName, (topServices.get(service.serviceName) ?? 0) + 1);
    }
  }
  const serviceScores = [...topServices.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
  const maxServiceCount = Math.max(1, ...serviceScores.map((service) => service.count));
  const pendingPayments = payments.filter((payment) => payment.status === 'UNVERIFIED');
  // How the recorded payment value splits by state. Each bar is the solid
  // version of the hue its badge uses, so a bar and its badge mean the same
  // thing. The bar is sized by the amount, and the amount is written out
  // beside it.
  const paymentStates = [
    { key: 'VERIFIED', label: 'Verified', badge: 'success', color: '--chart-verified' },
    { key: 'UNVERIFIED', label: 'Unverified', badge: 'warning', color: '--chart-unverified' },
    { key: 'REJECTED', label: 'Rejected', badge: 'danger', color: '--chart-rejected' },
  ] as const;
  const paymentTotals = paymentStates.map((state) => {
    const records = payments.filter((payment) => payment.status === state.key);
    const amount = records.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
    return { ...state, records, amount };
  });
  const paymentTotalAmount = paymentTotals.reduce((sum, state) => sum + state.amount, 0);
  const paymentBars = paymentTotals
    .filter((state) => state.records.length > 0)
    .map((state) => ({
      key: state.key,
      label: state.label,
      badge: state.badge,
      color: state.color,
      value: `₱${state.amount.toLocaleString()}`,
      share: paymentTotalAmount > 0 ? `${Math.round((state.amount / paymentTotalAmount) * 100)}%` : undefined,
      percent: paymentTotalAmount > 0 ? (state.amount / paymentTotalAmount) * 100 : 0,
      detail: `${state.records.length} payment${state.records.length === 1 ? '' : 's'} · ₱${state.amount.toLocaleString()} of ₱${paymentTotalAmount.toLocaleString()} (${Math.round((state.amount / paymentTotalAmount) * 100)}%)`,
    }));
  const monthRevenue = verifiedPayments
    .filter((payment) => String(payment.createdAt).slice(0, 7) === todayKey.slice(0, 7))
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

  return (
    <>
      <div className="stats-grid six-col">
        {loading
          ? Array.from({ length: 6 }, (_, index) => <StatCardSkeleton key={index} />)
          : dashboardMetrics.map((metric) => (
            <div key={metric.label} className="stat-card">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.suffix}</small>
            </div>
          ))}
      </div>

      <div className="two-col-panel">
        <section className="panel chart-panel">
          <div className="panel-header compact">
            <h3>Appointments by day</h3>
            <span>Last 7 days</span>
          </div>
          {loading ? (
            <SkeletonRegion label="Loading appointments by day">
              <ChartSkeleton height={292} />
            </SkeletonRegion>
          ) : (
            <>
              <p className="chart-caption">
                <span>{shortDate(bookingAxis[0].key)} – {shortDate(bookingAxis[bookingAxis.length - 1].key)}</span>
                <span>{Object.values(bookingSeries[0].values).reduce((sum, value) => sum + value, 0)} appointments</span>
              </p>
              <LineChart
                axis={bookingAxis}
                series={bookingSeries}
                unit="appointments"
                metricName="Appointments"
                emptyMessage="No appointments were recorded in the last seven days."
                height={292}
              />
              <DataOriginNote>Read from the appointment records on this page.</DataOriginNote>
            </>
          )}
        </section>

        <section className="panel summary-panel">
          <div className="panel-header compact">
            <h3>Payment Summary</h3>
            <span>Month</span>
          </div>
          {loading && (
            <SkeletonRegion label="Loading the payment summary">
              <ListSkeleton rows={4} />
            </SkeletonRegion>
          )}
          {!loading && <ul className="summary-list">
            <li><span>Total Verified</span><strong>{paymentsAvailable ? `₱${verifiedPayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0).toLocaleString()}` : '—'}</strong></li>
            <li><span>This Month</span><strong>{paymentsAvailable ? `₱${monthRevenue.toLocaleString()}` : '—'}</strong></li>
            <li><span>Pending Payments</span><strong>{paymentsAvailable ? pendingPayments.length : '—'}</strong></li>
            <li><span>Needs verification</span><strong>{paymentsAvailable ? `₱${pendingPayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0).toLocaleString()}` : '—'}</strong></li>
          </ul>}
          {paymentsAvailable && paymentBars.length > 0 && (
            <div className="payment-status-breakdown">
              <h4 className="breakdown-title">
                Recorded payment value, all statuses
                <span className="breakdown-total">₱{paymentTotalAmount.toLocaleString()} recorded</span>
              </h4>
              <CategoryBars items={paymentBars} emptyMessage="" />
              <DataOriginNote>Read from the payment records on this page.</DataOriginNote>
            </div>
          )}
        </section>
      </div>

      <div className="two-col-panel lower-panel">
        <section className="panel service-panel">
          <div className="panel-header compact">
            <h3>Most Frequently Booked Services</h3>
            <span>This month</span>
          </div>
          <div className="service-list">
            {serviceScores.map((service) => (
              <div key={service.name} className="service-row">
                <div className="service-name">{service.name}</div>
                <div className="service-meter"><span style={{ width: `${(service.count / maxServiceCount) * 100}%` }} /></div>
                <div className="service-score">{service.count}</div>
              </div>
            ))}
            {serviceScores.length === 0 && <p className="empty-list">No service bookings to show for this period.</p>}
          </div>
        </section>

        <section className="panel review-panel">
          <div className="panel-header compact">
            <h3>Reviews &amp; Ratings</h3>
            <span className="rating-pill">{averageRating}</span>
          </div>
          <div className="customer-rating-row">
            <strong>{averageRating}</strong>
            <small>Based on {reviewData.length} recent reviews</small>
          </div>
          <div className="review-list">
            {reviewData.map((review) => (
              <div key={review.id} className="review-item">
                <div className="review-head">
                  <strong>{review.customer}</strong>
                  <span>{review.date}</span>
                </div>
                <div className="stars" aria-label={`Rated ${review.rating} stars`}>
                  {'★★★★★'.slice(0, review.rating)}
                </div>
                <p>{review.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

    </>
  );
}

type ServiceRecord = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
  isActive: boolean;
  imageUrl?: string | null;
};

type CategoryRecord = { id: string; name: string; isActive: boolean };

function ServiceManagementPage() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editing, setEditing] = useState<ServiceRecord | null | 'new'>(null);
  const [action, setAction] = useState<{ type: 'delete' | 'suspend'; service: ServiceRecord } | null>(null);
  const [manageCategories, setManageCategories] = useState(false);
  const [outcome, setOutcome] = useState<{ success: boolean; title: string; message: string } | null>(null);
  const token = getAccessToken();

  async function loadCatalog(signal?: AbortSignal) {
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const [serviceResponse, categoryResponse] = await Promise.all([
      apiFetch(`${baseUrl}/services`, { signal, headers }),
      apiFetch(`${baseUrl}/services/categories`, { signal, headers }),
    ]);
    const [servicePayload, categoryPayload] = await Promise.all([serviceResponse.json(), categoryResponse.json()]);
    if (!serviceResponse.ok) throw new Error(servicePayload.message ?? 'Unable to load services.');
    if (!categoryResponse.ok) throw new Error(categoryPayload.message ?? 'Unable to load service categories.');
    setServices(servicePayload?.data?.services ?? []);
    setCategories(categoryPayload?.data?.categories ?? []);
  }

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setLoadError('Sign in to view the service catalog.');
      return;
    }
    const controller = new AbortController();
    loadCatalog(controller.signal)
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Unable to load the service catalog.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const visibleServices = services.filter((service) =>
    (categoryFilter === 'all' || service.categoryId === categoryFilter)
    && `${service.name} ${service.categoryName} ${service.description ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  async function saveService(values: { categoryId: string; name: string; description: string; price: number; durationMinutes: number }, service: ServiceRecord | null): Promise<string | null> {
    if (!token) throw new Error('Sign in with an administrator account to manage services.');
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const response = await apiFetch(service ? `${baseUrl}/services/${service.id}` : `${baseUrl}/services`, {
      method: service ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? 'Unable to save the service.');
    await loadCatalog();
    // The image is uploaded against the saved service, so the caller needs
    // its id before the editor closes.
    return String(payload?.data?.service?.id ?? payload?.data?.id ?? service?.id ?? '') || null;
  }

  /** Close the editor and report the outcome once the image upload has settled. */
  function handleServiceSaved(summary: { name: string; isEdit: boolean }) {
    setEditing(null);
    setOutcome({ success: true, title: summary.isEdit ? 'Service updated' : 'Service added', message: `${summary.name} has been saved to the service catalog.` });
  }

  async function updateServiceStatus(service: ServiceRecord, active: boolean, deleting = false) {
    if (!token) { setOutcome({ success: false, title: 'Sign in required', message: 'Sign in with an administrator account to manage services.' }); return; }
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const response = await apiFetch(`${baseUrl}/services/${service.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: active }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? 'Unable to update the service.');
    await loadCatalog();
    setAction(null);
    setOutcome({ success: true, title: deleting ? 'Service archived' : active ? 'Service activated' : 'Service suspended', message: `${service.name} is now ${active ? 'available' : 'inactive'} in the catalog.` });
  }

  return (
    <section className="panel service-management">
      <div className="panel-header service-management-header">
        <div><h3>Service Catalog</h3><p>Maintain the services, categories, and rates shown throughout the studio.</p></div>
        <div className="service-toolbar">
          <button type="button" className="secondary-action" onClick={() => setManageCategories(true)}>Manage Categories</button>
          <button type="button" className="primary-button" disabled={!token} onClick={() => setEditing('new')}>+ Add Service</button>
        </div>
      </div>
      <div className="service-filters">
        <input aria-label="Search services" type="search" className="search-input" placeholder="Search services..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filter by category" className="modal-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      {loading && (
        <SkeletonRegion label="Loading the service catalogue">
          <TableSkeleton rows={5} columns={4} />
        </SkeletonRegion>
      )}
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!loading && !loadError && (
        <div className="service-table-scroll">
          <table role="table" className="responsive-table">
            <thead role="rowgroup"><tr><th role="columnheader" scope="col">Service</th><th role="columnheader" scope="col">Category</th><th role="columnheader" scope="col">Duration</th><th role="columnheader" scope="col">Price</th><th role="columnheader" scope="col">Status</th><th role="columnheader" scope="col">Actions</th></tr></thead>
            <tbody role="rowgroup">
              {visibleServices.map((service) => (
                <tr role="row" key={service.id}>
                  <td role="cell" data-label="Service" data-primary><strong>{service.name}</strong>{service.description && <small className="service-description">{service.description}</small>}</td>
                  <td role="cell" data-label="Category">{service.categoryName}</td>
                  <td role="cell" data-label="Duration">{service.durationMinutes} min</td>
                  <td role="cell" data-label="Price">₱{Number(service.price).toLocaleString()}</td>
                  <td role="cell" data-label="Status"><span className={`status-badge ${service.isActive ? 'success' : 'neutral'}`}>{service.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="cell-actions" role="cell" data-label="Actions"><div className="service-actions">
                    <button type="button" className="link-button" onClick={() => setEditing(service)}>Edit</button>
                    <button type="button" className={`link-button${service.isActive ? ' danger-link' : ' approve-link'}`} onClick={() => setAction({ type: 'suspend', service })}>{service.isActive ? 'Suspend' : 'Activate'}</button>
                    <button type="button" className="link-button danger-link" disabled={!service.isActive} onClick={() => setAction({ type: 'delete', service })}>Archive</button>
                  </div></td>
                </tr>
              ))}
              {visibleServices.length === 0 && <tr role="row"><td colSpan={6} className="cell-empty" role="cell" data-empty>{services.length ? 'No services match these filters.' : 'No services in the catalog yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && <ServiceEditorModal service={editing === 'new' ? null : editing} categories={categories.filter((category) => category.isActive)} onClose={() => setEditing(null)} onSave={saveService} onSaved={handleServiceSaved} />}
      {manageCategories && <CategoryManagerModal categories={categories} onClose={() => setManageCategories(false)} onChanged={async () => { await loadCatalog(); }} onOutcome={setOutcome} />}
      {action && (
        <ConfirmModal
          title={action.type === 'delete' ? 'Archive Service?' : action.service.isActive ? 'Suspend Service?' : 'Activate Service?'}
          message={action.type === 'delete'
            ? `${action.service.name} will be archived from the active catalog. Past appointment records are preserved.`
            : `${action.service.name} will be ${action.service.isActive ? 'unavailable' : 'available'} for new bookings.`}
          confirmLabel={action.type === 'delete' ? 'Archive service' : action.service.isActive ? 'Suspend service' : 'Activate service'}
          danger={action.type === 'delete' || action.service.isActive}
          onClose={() => setAction(null)}
          onConfirm={async () => { await updateServiceStatus(action.service, action.type !== 'delete' && !action.service.isActive, action.type === 'delete'); }}
          onError={(error) => setOutcome({ success: false, title: 'Unable to update service', message: error })}
        />
      )}
      {outcome && <ResultModal {...outcome} onClose={() => setOutcome(null)} />}
    </section>
  );
}

function ServiceEditorModal({ service, categories, onClose, onSave, onSaved }: {
  service: ServiceRecord | null;
  categories: CategoryRecord[];
  onClose: () => void;
  onSave: (values: { categoryId: string; name: string; description: string; price: number; durationMinutes: number }, service: ServiceRecord | null) => Promise<string | null>;
  onSaved: (summary: { name: string; isEdit: boolean }) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const imageRef = useRef<ImageUploadHandle | null>(null);
  const dialogRef = useDialogBehavior<HTMLFormElement>(onClose);

  /**
   * Check the fields of the service editor.
   *
   * The price is a peso amount, so it may hold two decimal places and may
   * not be negative. The duration is a count of whole minutes. The name is
   * the name of a service, not the name of a person, so the personal-name
   * rule does not apply to it.
   */
  function collectFieldErrors(form: FormData): Record<string, string> {
    const errors: Record<string, string> = {};
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const price = String(form.get('price') ?? '').trim();
    const duration = String(form.get('durationMinutes') ?? '').trim();
    if (!name) errors.name = 'Enter a name for the service.';
    else if (name.length > 200) errors.name = 'Keep the name under 200 characters.';
    if (description.length > 500) errors.description = 'Keep the description under 500 characters.';
    if (!price) errors.price = 'Enter a price.';
    // The API requires a price above zero, so the field does too.
    else if (!isValidAmount(price, { allowZero: false })) errors.price = POSITIVE_AMOUNT_MESSAGE;
    if (!duration) errors.durationMinutes = 'Enter a duration.';
    else if (!isValidDuration(duration)) errors.durationMinutes = DURATION_MESSAGE;
    return errors;
  }

  function recheckField(field: string, form: HTMLFormElement | null) {
    if (!form) return;
    if (!Object.prototype.hasOwnProperty.call(fieldErrors, field)) return;
    const errors = collectFieldErrors(new FormData(form));
    setFieldErrors((current) => {
      const next = { ...current };
      if (errors[field]) next[field] = errors[field];
      else delete next[field];
      return next;
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const errors = collectFieldErrors(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      // The dialog stays open and keeps what was typed.
      for (const field of ['name', 'description', 'price', 'durationMinutes']) {
        if (!errors[field]) continue;
        event.currentTarget.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
        break;
      }
      return;
    }
    setBusy(true);
    setError('');
    const name = String(form.get('name')).trim();
    try {
      const savedId = await onSave({
        categoryId: String(form.get('categoryId')),
        name,
        description: String(form.get('description')).trim(),
        price: Number(form.get('price')),
        durationMinutes: Number(form.get('durationMinutes')),
      }, service);

      // The image is stored against the saved service, so it is uploaded
      // after the service exists.
      if (imageRef.current?.hasPendingFile()) {
        if (!savedId) {
          throw new Error('The service was saved, but its image could not be uploaded because the service id was not returned.');
        }
        await imageRef.current.upload(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/services/${savedId}/image`);
      }
      onSaved({ name, isEdit: Boolean(service) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the service.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="service-editor-title" onClick={onClose}>
      <form ref={dialogRef} className="modal-card service-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()} noValidate>
        <div className="modal-header"><h3 id="service-editor-title">{service ? 'Edit Service' : 'Add Service'}</h3><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>

        <ImageUploadField ref={imageRef} label="SERVICE PHOTO" idPrefix="service-image" initialUrl={service?.imageUrl ?? null} />

        <label className="field-label">SERVICE NAME
          <input className="modal-input" name="name" defaultValue={service?.name ?? ''} required maxLength={200}
            onBlur={(event) => recheckField('name', event.currentTarget.form)}
            {...invalidField('service-name-error', fieldErrors.name)} />
          <FieldError id="service-name-error" message={fieldErrors.name} />
        </label>
        <label className="field-label">CATEGORY<select className="modal-input" name="categoryId" defaultValue={service?.categoryId ?? categories[0]?.id ?? ''} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field-label">DESCRIPTION
          <textarea className="modal-input" name="description" defaultValue={service?.description ?? ''} maxLength={500} rows={3}
            onBlur={(event) => recheckField('description', event.currentTarget.form)}
            {...invalidField('service-description-error', fieldErrors.description)} />
          <FieldError id="service-description-error" message={fieldErrors.description} />
        </label>
        <div className="form-grid">
          <label className="field-label">PRICE (PHP)
          <input className="modal-input" name="price" type="text" inputMode="decimal" min="0" step="0.01"
            defaultValue={service?.price ?? ''} required
            onBlur={(event) => recheckField('price', event.currentTarget.form)}
            {...invalidField('service-price-error', fieldErrors.price)} />
          <FieldError id="service-price-error" message={fieldErrors.price} />
        </label>
          <label className="field-label">DURATION (MINUTES)
          <input className="modal-input" name="durationMinutes" type="text" inputMode="numeric" min="1" max="300" step="1"
            defaultValue={service?.durationMinutes ?? ''} required
            onBlur={(event) => recheckField('durationMinutes', event.currentTarget.form)}
            {...invalidField('service-duration-error', fieldErrors.durationMinutes)} />
          <FieldError id="service-duration-error" message={fieldErrors.durationMinutes} />
        </label>
        </div>
        {categories.length === 0 && <p className="form-error">Add an active category before creating a service.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={onClose}>Cancel</button><button type="submit" className="primary-action" disabled={busy || categories.length === 0}>{busy ? 'Saving…' : 'Save Service'}</button></div>
      </form>
    </div>
  );
}

function CategoryManagerModal({ categories, onClose, onChanged, onOutcome }: {
  categories: CategoryRecord[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onOutcome: (result: { success: boolean; title: string; message: string }) => void;
}) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useDialogBehavior(onClose);
  async function saveCategory(id?: string) {
    const name = (id ? editingName : newName).trim();
    // A category is a short label, so it is checked as short text rather
    // than by any of the rules meant for a person's name.
    if (!name) {
      if (id) setError('Enter a category name.');
      else setNameError('Enter a category name.');
      return;
    }
    if (name.length > 100) {
      if (id) setError('Keep the category name under 100 characters.');
      else setNameError('Keep the category name under 100 characters.');
      return;
    }
    setNameError('');
    const token = getAccessToken();
    if (!token) { setError('Sign in with an administrator account to manage categories.'); return; }
    setBusy(true);
    setError('');
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(id ? `${baseUrl}/services/categories/${id}` : `${baseUrl}/services/categories`, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to save category.');
      await onChanged();
      if (id) setEditingId(''); else setNewName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save category.');
    } finally {
      setBusy(false);
    }
  }
  async function toggleCategory(category: CategoryRecord) {
    const token = getAccessToken();
    if (!token) { setError('Sign in with an administrator account to manage categories.'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/services/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to update category.');
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update category.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="category-manager-title" onClick={onClose}>
      <section ref={dialogRef} className="modal-card service-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><h3 id="category-manager-title">Manage Categories</h3><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="category-create-row">
          <input className="modal-input" aria-label="New category name" placeholder="New category name" value={newName}
            onChange={(event) => { setNewName(event.target.value); setNameError(''); }} maxLength={100}
            {...invalidField('category-new-name-error', nameError)} />
          <button type="button" className="primary-action" disabled={busy} onClick={() => void saveCategory()}>Add</button>
        </div>
        <FieldError id="category-new-name-error" message={nameError} />
        <ul className="category-list">{categories.map((category) => (
          <li key={category.id}>
            {editingId === category.id
              ? <><input className="modal-input" aria-label="Edit category name" value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={100} /><button type="button" className="primary-action" disabled={busy} onClick={() => void saveCategory(category.id)}>Save</button><button type="button" className="secondary-action" onClick={() => setEditingId('')}>Cancel</button></>
              : <><span><strong>{category.name}</strong><small>{category.isActive ? 'Active' : 'Inactive'}</small></span><button type="button" className="link-button" onClick={() => { setEditingId(category.id); setEditingName(category.name); }}>Edit</button><button type="button" className="link-button" disabled={busy} onClick={() => void toggleCategory(category)}>{category.isActive ? 'Deactivate' : 'Activate'}</button></>}
          </li>
        ))}</ul>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={onClose}>Close</button></div>
      </section>
    </div>
  );
}


function ConfirmModal({ title, message, confirmLabel, danger, onClose, onConfirm, onError }: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onError: (error: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useDialogBehavior(onClose);
  async function confirm() {
    setBusy(true);
    try {
      const result = onConfirm();
      if (result instanceof Promise) {
        await result;
      }
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The operation failed.');
    } finally { setBusy(false); }
  }
  return (
    <div className="modal-overlay confirm-layer" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" onClick={onClose}>
      <section ref={dialogRef} className="modal-card confirm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><h3 id="confirm-action-title">{title}</h3><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
        <p>{message}</p>
        <div className="modal-actions"><button type="button" className="secondary-action" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className={danger ? 'reject-action' : 'primary-action'} disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving…' : confirmLabel}</button></div>
      </section>
    </div>
  );
}

function ResultModal({ success, title, message, onClose }: { success: boolean; title: string; message: string; onClose: () => void }) {
  const dialogRef = useDialogBehavior(onClose);
  return (
    <div className="modal-overlay result-layer" role="dialog" aria-modal="true" aria-labelledby="result-modal-title">
      <section ref={dialogRef} className="modal-card result-modal">
        <div className={`result-icon ${success ? 'success' : 'failure'}`} aria-hidden="true">{success ? '✓' : '!'}</div>
        <h3 id="result-modal-title">{title}</h3>
        <p>{message}</p>
        <div className="modal-actions"><button type="button" className="primary-action" onClick={onClose}>Continue</button></div>
      </section>
    </div>
  );
}

function AccountManagementPage() {
  const [rows, setRows, loadState] = useAccountData();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingAction, setPendingAction] = useState<{ row: TableRow; nextStatus: 'ACTIVE' | 'DEACTIVATED' } | null>(null);
  const visibleRows = rows.filter((row) => row.role !== 'Customer' && `${row.user} ${row.email} ${row.role}`.toLowerCase().includes(search.toLowerCase()));

  async function updateAccountStatus(row: TableRow, nextStatus: 'ACTIVE' | 'DEACTIVATED') {
    if (!row.accountId) return;
    const token = getAccessToken();
    if (!token) {
      setStatusMessage('Sign in with an administrator account to update account access.');
      return;
    }

    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(`${baseUrl}/accounts/${row.accountId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to update account access.');
      setRows((current) => current.map((item) => item.accountId === row.accountId
        ? { ...item, status: nextStatus === 'ACTIVE' ? 'Active' : 'Deactivated' }
        : item));
      setStatusMessage(`Account access set to ${nextStatus === 'ACTIVE' ? 'active' : 'deactivated'}.`);
    } catch (cause) {
      setStatusMessage(cause instanceof Error ? cause.message : 'Unable to update account access.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <div className="stats-grid four-col">
        <div className="stat-card compact-stat">
          <span>Total Accounts</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="stat-card compact-stat">
          <span>Managers</span>
          <strong>{rows.filter((row) => row.role === 'Manager').length}</strong>
        </div>
        <div className="stat-card compact-stat">
          <span>Staff Members</span>
          <strong>{rows.filter((row) => row.role === 'Staff').length}</strong>
        </div>
        <div className="stat-card compact-stat">
          <span>Super Admins</span>
          <strong>{rows.filter((row) => row.role === 'Super Admin').length}</strong>
        </div>
      </div>

      <div className="accounts-layout">
        <section className="panel table-panel large-table">
          <div className="panel-header compact">
            <h3>User Accounts Directory</h3>
            {/* The action belongs to the table it acts upon, so it sits in
                the table's own toolbar beside the search field. */}
            <div className="panel-header-tools">
              <input aria-label="Search accounts" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email or role..." className="search-input" />
              <button type="button" className="primary-button create-account-button" onClick={() => setShowCreateModal(true)}>Create New Account</button>
            </div>
          </div>
          {loadState === 'loading' && (
            <SkeletonRegion label="Loading accounts">
              <TableSkeleton rows={6} columns={5} />
            </SkeletonRegion>
          )}
          {loadState === 'error' && <p className="form-error" role="alert">Accounts could not be loaded. Check the backend connection and reload the page.</p>}
          {loadState === 'ready' && (
          <div className="table-scroll">
            <table role="table" className="responsive-table">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">User / Email</th>
                  <th role="columnheader" scope="col">Role</th>
                  <th role="columnheader" scope="col">Status</th>
                  <th role="columnheader" scope="col">Last Login / Created</th>
                  <th role="columnheader" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {visibleRows.map((row) => (
                  <tr role="row" key={row.email}>
                    <td role="cell" data-label="User / Email" data-primary>
                      <div className="user-cell">
                        <span className="user-avatar">{row.id}</span>
                        <div>
                          <strong>{row.user}</strong>
                          <small>{row.email}</small>
                        </div>
                      </div>
                    </td>
                    <td role="cell" data-label="Role"><span className="role-badge">{row.role}</span></td>
                    <td role="cell" data-label="Status">
                      <span className={`status-badge ${row.status === 'Active' ? 'success' : row.status === 'Deactivated' ? 'danger' : 'warning'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td role="cell" data-label="Last Login / Created">{row.lastLogin}</td>
                    <td className="cell-actions" role="cell" data-label="Actions"><button type="button" className={`link-button${row.status === 'Active' ? ' danger-link' : ' approve-link'}`} disabled={!row.accountId} onClick={() => setPendingAction({ row, nextStatus: row.status === 'Active' ? 'DEACTIVATED' : 'ACTIVE' })}>{row.status === 'Active' ? 'Deactivate' : 'Activate'}</button></td>
                  </tr>
                ))}
                {visibleRows.length === 0 && <tr role="row"><td colSpan={5} className="cell-empty" role="cell" data-empty>{rows.length ? 'No accounts match this search.' : 'No account records are available for this session.'}</td></tr>}
              </tbody>
            </table>
          </div>
          )}
          {statusMessage && <p className="table-message" role="status">{statusMessage}</p>}
        </section>

        <aside className="panel side-panel">
          <div className="panel-header compact">
            <h3>Staff Access Overview</h3>
          </div>
          <ul className="log-list">
            <li><span className="log-dot green" /><div>Staff accounts only<small>Customer records remain available in appointments, payments, and service workflows.</small></div></li>
          </ul>
        </aside>
      </div>

      {pendingAction && (
        <ConfirmModal
          title={pendingAction.nextStatus === 'ACTIVE' ? 'Activate staff account?' : 'Deactivate staff account?'}
          message={pendingAction.nextStatus === 'ACTIVE'
            ? `Activate ${pendingAction.row.user} (${pendingAction.row.email}) and restore access to the staff portal?`
            : `Deactivate ${pendingAction.row.user} (${pendingAction.row.email}) and revoke access until reactivated?`}
          confirmLabel={pendingAction.nextStatus === 'ACTIVE' ? 'Activate account' : 'Deactivate account'}
          danger={pendingAction.nextStatus === 'DEACTIVATED'}
          onClose={() => setPendingAction(null)}
          onConfirm={() => void updateAccountStatus(pendingAction.row, pendingAction.nextStatus)}
          onError={(error) => setStatusMessage(error)}
        />
      )}
      {showCreateModal && <AccountCreationModal onClose={() => setShowCreateModal(false)} />}
    </>
  );
}

/** A schedule request, as the administrator sees it. */
interface ScheduleRequestRow {
  id: string;
  /** The staff profile the request belongs to. */
  staffId: string;
  /** The staff member's display name, resolved on the server. */
  requesterName: string | null;
  /** The email on the account the request belongs to. */
  requesterEmail: string | null;
  requestedDate: string;
  requestedStartTime: string | null;
  requestedEndTime: string | null;
  requestType: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedAt: string | null;
  createdAt: string;
}

function StaffManagementPage() {
  const [rows, setRows, loadState] = useStaffData();
  const [scheduleRequests, setScheduleRequests] = useState<ScheduleRequestRow[]>([]);
  const [scheduleRequestsLoading, setScheduleRequestsLoading] = useState(true);
  const [scheduleRequestCount, setScheduleRequestCount] = useState(0);
  const [search, setSearch] = useState('');
  const [editingStaff, setEditingStaff] = useState<StaffRow | null>(null);
  const [employmentFilter, setEmploymentFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState('all');
  const [accessNotice, setAccessNotice] = useState('');
  const [accessError, setAccessError] = useState('');
  const [accessChange, setAccessChange] = useState<{ row: StaffRow; next: 'ACTIVE' | 'DEACTIVATED' } | null>(null);
  const [credentials, setCredentials] = useState<StaffCredentials | null>(null);
  const [credentialError, setCredentialError] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState<{ request: ScheduleRequestRow; decision: 'approve' | 'reject' } | null>(null);

  const visibleRows = rows
    .filter((row) => `${row.user} ${row.email} ${row.role} ${row.schedule}`.toLowerCase().includes(search.toLowerCase()))
    .filter((row) => employmentFilter === 'all' || row.employment === employmentFilter)
    .filter((row) => availabilityFilter === 'all' || row.status === availabilityFilter)
    .filter((row) => accessFilter === 'all' || row.accountStatus === accessFilter);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const controller = new AbortController();
    apiFetch(`${baseUrl}/schedules/requests`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const payload = await response.json();
        if (response.ok) {
          const requests = (payload?.data?.scheduleRequests ?? []) as ScheduleRequestRow[];
          setScheduleRequests(requests);
          setScheduleRequestCount(requests.length);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setScheduleRequestsLoading(false); });
    return () => controller.abort();
  }, []);

  /**
   * Load the schedule requests.
   *
   * The list is reloaded after a review so the status shown here is the
   * status the server recorded, including the requester's identity.
   */
  async function loadScheduleRequests() {
    const token = getAccessToken();
    if (!token) return;
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    try {
      const response = await apiFetch(`${baseUrl}/schedules/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) return;
      const requests = (payload?.data?.scheduleRequests ?? []) as ScheduleRequestRow[];
      setScheduleRequests(requests);
      setScheduleRequestCount(requests.length);
    } catch {
      /* The panel keeps the requests it already has. */
    }
  }

  /**
   * Approve or reject a schedule request.
   *
   * The requester is named in the confirmation, so the administrator is
   * acting on a request they can identify.
   */
  async function reviewScheduleRequest(request: ScheduleRequestRow, decision: 'approve' | 'reject') {
    const token = getAccessToken();
    if (!token) { setAccessError('Sign in with an administrator account to review requests.'); return; }
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    setReviewingRequestId(request.id);
    try {
      const response = await apiFetch(`${baseUrl}/schedules/requests/${request.id}/${decision}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        setAccessError(payload?.message ?? 'The request could not be reviewed.');
        return;
      }
      setAccessNotice(`Request from ${request.requesterName ?? 'the staff member'} was ${decision === 'approve' ? 'approved' : 'rejected'}.`);
      await loadScheduleRequests();
    } catch {
      setAccessError('The request could not be reviewed.');
    } finally {
      setReviewingRequestId(null);
      setPendingReview(null);
    }
  }

  /**
   * Change whether a staff account may sign in.
   *
   * This is the account's own lifecycle, and it is separate from the staff
   * work status. Deactivating an account blocks sign-in and leaves the staff
   * profile and its schedule in place.
   */
  async function changeAccountAccess(row: StaffRow, next: 'ACTIVE' | 'DEACTIVATED') {
    const token = getAccessToken();
    if (!token || !row.accountId) {
      setAccessError('Sign in with an administrator account to manage staff access.');
      return;
    }
    setSavingAccess(true);
    setAccessError('');
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(`${baseUrl}/accounts/${row.accountId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? payload.message ?? 'The account status could not be changed.');
      setAccessChange(null);
      setAccessNotice(next === 'ACTIVE'
        ? `${row.user} can sign in again.`
        : `${row.user} can no longer sign in. Their staff profile and schedule are unchanged.`);
      window.location.reload();
    } catch (cause) {
      setAccessError(cause instanceof Error ? cause.message : 'The account status could not be changed.');
    } finally {
      setSavingAccess(false);
    }
  }

  /**
   * Issue a temporary sign-in password for a staff account.
   *
   * The API stores a hash and never returns the original password, so the
   * administrator sets a new one. It is shown once, in the panel, and is not
   * written to any browser storage.
   */
  async function setCredentialsFor(row: StaffRow) {
    if (!row.accountId) return;
    setCredentialError('');
    setIssuing(true);
    try {
      const password = generateTemporaryPassword();
      await issueStaffPassword(row.accountId, password);
      setCredentials({ accountId: row.accountId, email: row.email, name: row.user, password });
    } catch (cause) {
      setCredentialError(cause instanceof Error ? cause.message : 'A temporary password could not be issued.');
    } finally {
      setIssuing(false);
    }
  }

  return (
    <>
      <div className="stats-grid four-col staff-metrics">
        <div className="stat-card compact-stat">
          <span>Total Staff</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="stat-card compact-stat">
          <span>On Duty Today</span>
          <strong>{rows.filter((row) => row.status === 'Active').length}</strong>
        </div>
        <div className="stat-card compact-stat">
          <span>Day Off / Unavailable</span>
          <strong>{rows.filter((row) => row.status !== 'Active').length}</strong>
        </div>
        <div className="stat-card compact-stat">
          <span>Schedule Requests</span>
          <strong>{scheduleRequestCount}</strong>
        </div>
      </div>

      <section className="panel schedule-requests-panel">
        <div className="panel-header compact">
          <h3>Schedule Requests</h3>
          <span>{scheduleRequestCount} {scheduleRequestCount === 1 ? 'request' : 'requests'}</span>
        </div>
        {scheduleRequestsLoading ? (
          <SkeletonRegion label="Loading schedule requests">
            <ListSkeleton rows={3} />
          </SkeletonRegion>
        ) : scheduleRequests.length === 0 ? (
          <p className="empty-list">No schedule requests have been submitted.</p>
        ) : (
          <ul className="schedule-request-list">
            {scheduleRequests.map((request) => (
              <li key={request.id} className="schedule-request-item">
                <div className="schedule-request-who">
                  {/* The requester is named in words, not by an identifier,
                      so the administrator can tell whose request this is. */}
                  <strong>{request.requesterName ?? 'Unknown staff member'}</strong>
                  <small>{request.requesterEmail || 'No email on file'}</small>
                </div>
                <div className="schedule-request-what">
                  <span className="schedule-request-type">{request.requestType}</span>
                  <small>
                    {formatRequestDate(request.requestedDate)}
                    {request.requestedStartTime && request.requestedEndTime
                      ? ` · ${request.requestedStartTime}–${request.requestedEndTime}`
                      : request.requestedStartTime ? ` · from ${request.requestedStartTime}` : ''}
                  </small>
                  {request.reason && <small className="schedule-request-reason">{request.reason}</small>}
                  <small className="schedule-request-submitted">Submitted {formatRequestDate(request.createdAt)}</small>
                </div>
                <span className={`status-badge ${request.status === 'APPROVED' ? 'success' : request.status === 'REJECTED' ? 'danger' : 'warning'}`}>
                  {request.status === 'APPROVED' ? 'Approved' : request.status === 'REJECTED' ? 'Rejected' : 'Pending'}
                </span>
                {request.status === 'PENDING' && (
                  <span className="schedule-request-actions">
                    <button type="button" className="link-button approve-link" disabled={reviewingRequestId === request.id} onClick={() => setPendingReview({ request, decision: 'approve' })}>Approve</button>
                    <button type="button" className="link-button danger-link" disabled={reviewingRequestId === request.id} onClick={() => setPendingReview({ request, decision: 'reject' })}>Reject</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {accessNotice && <p className="form-hint" role="status">{accessNotice}</p>}
      {accessError && <p className="form-error" role="alert">{accessError}</p>}
      {credentialError && <p className="form-error" role="alert">{credentialError}</p>}
      {issuing && <p className="form-hint" role="status">Issuing a temporary password…</p>}

      <section className="panel table-panel large-table">
        <div className="panel-header compact staff-directory-header">
          <h3>Royal Salon Professional Staff Directory</h3>
          <div className="table-tools">
            <input aria-label="Search staff" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email or role..." className="search-input" />
            <label className="sr-only" htmlFor="staff-filter-employment">Filter by employment type</label>
            <select id="staff-filter-employment" className="search-input" value={employmentFilter} onChange={(event) => setEmploymentFilter(event.target.value)}>
              <option value="all">All employment</option>
              <option value="Full Time">Full time</option>
              <option value="Part Time">Part time</option>
            </select>
            <label className="sr-only" htmlFor="staff-filter-availability">Filter by availability</label>
            <select id="staff-filter-availability" className="search-input" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}>
              <option value="all">All availability</option>
              <option value="Active">On duty</option>
              <option value="Day Off">Day off</option>
              <option value="On Vacation">Unavailable</option>
            </select>
            <label className="sr-only" htmlFor="staff-filter-access">Filter by account access</label>
            <select id="staff-filter-access" className="search-input" value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}>
              <option value="all">All access</option>
              <option value="Active">Can sign in</option>
              <option value="Deactivated">Cannot sign in</option>
            </select>
          </div>
        </div>
        {loadState === 'loading' && (
          <SkeletonRegion label="Loading the staff directory">
            <TableSkeleton rows={5} columns={4} />
          </SkeletonRegion>
        )}
        {loadState === 'error' && <p className="form-error" role="alert">The staff directory could not be loaded. Check the backend connection and reload the page.</p>}
        {loadState === 'ready' && (
        <div className="table-scroll">
          <table role="table" className="responsive-table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">User / Email</th>
                <th role="columnheader" scope="col">Primary Role</th>
                <th role="columnheader" scope="col">Employment Type</th>
                <th role="columnheader" scope="col">Current Schedule</th>
                <th role="columnheader" scope="col">Account Access</th>
                <th role="columnheader" scope="col">Availability</th>
                <th role="columnheader" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {visibleRows.map((row) => (
                <tr role="row" key={row.email}>
                  <td role="cell" data-label="User / Email" data-primary>
                    <div className="user-cell">
                      <span className="user-avatar">{row.user.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <strong>{row.user}</strong>
                        <small className="user-cell-email">{row.email}</small>
                      </div>
                    </div>
                  </td>
                  <td role="cell" data-label="Primary Role">{row.role}</td>
                  <td role="cell" data-label="Employment Type">{row.employment}</td>
                  <td role="cell" data-label="Current Schedule">{row.schedule}</td>
                  <td role="cell" data-label="Account Access">
                    <span className={`status-badge ${row.accountStatus === 'Active' ? 'success' : 'danger'}`}>
                      {row.accountStatus}
                    </span>
                  </td>
                  <td role="cell" data-label="Availability">
                    <span className={`status-badge ${row.status === 'Active' ? 'warning' : 'neutral'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="staff-row-actions cell-actions" role="cell" data-label="Actions">
                    <button type="button" className="link-button" disabled={!row.id} onClick={() => row.id && setEditingStaff(row)}>Edit</button>
                    <button
                      type="button"
                      className={`link-button${row.accountStatus === 'Active' ? ' danger-link' : ' approve-link'}`}
                      disabled={!row.accountId}
                      onClick={() => row.accountId && setAccessChange({
                        row,
                        next: row.accountStatus === 'Active' ? 'DEACTIVATED' : 'ACTIVE',
                      })}
                    >
                      {row.accountStatus === 'Active' ? 'Deactivate access' : 'Restore access'}
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      disabled={!row.accountId}
                      onClick={() => row.accountId && setCredentialsFor(row)}
                      title="Issue new sign-in details for this staff member."
                    >
                      Sign-in details
                    </button>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && <tr role="row"><td colSpan={7} className="cell-empty" role="cell" data-empty>No staff records match this view.</td></tr>}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {editingStaff && (
        <StaffEditModal
          staff={editingStaff}
          onClose={() => setEditingStaff(null)}
          onSaved={() => { setEditingStaff(null); window.location.reload(); }}
        />
      )}


      {credentials && (
        <StaffCredentialsPanel
          credentials={credentials}
          onClose={() => setCredentials(null)}
        />
      )}

      {pendingReview && (
        <ConfirmModal
          title={pendingReview.decision === 'approve' ? 'Approve schedule request?' : 'Reject schedule request?'}
          message={pendingReview.decision === 'approve'
            ? `Approve the ${pendingReview.request.requestType.toLowerCase()} request from ${pendingReview.request.requesterName ?? 'the staff member'}${pendingReview.request.requesterEmail ? ` (${pendingReview.request.requesterEmail})` : ''}?`
            : `Reject the ${pendingReview.request.requestType.toLowerCase()} request from ${pendingReview.request.requesterName ?? 'the staff member'}${pendingReview.request.requesterEmail ? ` (${pendingReview.request.requesterEmail})` : ''}?`}
          confirmLabel={pendingReview.decision === 'approve' ? 'Approve request' : 'Reject request'}
          danger={pendingReview.decision === 'reject'}
          onClose={() => { setPendingReview(null); }}
          onConfirm={() => void reviewScheduleRequest(pendingReview.request, pendingReview.decision)}
          onError={(error) => setAccessError(error)}
        />
      )}
      {accessChange && (
        <div className="modal-overlay confirm-layer" role="dialog" aria-modal="true" aria-labelledby="staff-access-confirm" onClick={() => setAccessChange(null)}>
          <section className="modal-card confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 id="staff-access-confirm">
                {accessChange.next === 'ACTIVE' ? 'Restore sign-in access?' : 'Deactivate sign-in access?'}
              </h3>
              <button type="button" className="close-button" aria-label="Close" onClick={() => setAccessChange(null)}>×</button>
            </div>
            <p>
              {accessChange.next === 'ACTIVE'
                ? `${accessChange.row.user} will be able to sign in to the staff dashboard again.`
                : `${accessChange.row.user} will no longer be able to sign in. Their staff profile, schedule and bookings are kept as they are.`}
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-action" disabled={savingAccess} onClick={() => setAccessChange(null)}>Cancel</button>
              <button
                type="button"
                className={accessChange.next === 'ACTIVE' ? 'approve-action' : 'reject-action'}
                disabled={savingAccess}
                onClick={() => void changeAccountAccess(accessChange.row, accessChange.next)}
              >
                {savingAccess ? 'Saving…' : accessChange.next === 'ACTIVE' ? 'Restore access' : 'Deactivate access'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

type TimeOffRecord = {
  id: string;
  staffId: string;
  type: 'VACATION' | 'DAY_OFF';
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
};

function StaffEditModal({ staff, onClose, onSaved }: { staff: StaffRow; onClose: () => void; onSaved: () => void }) {
  const [timeOff, setTimeOff] = useState<TimeOffRecord[]>([]);
  const [showTimeOff, setShowTimeOff] = useState(false);
  const [editingTimeOff, setEditingTimeOff] = useState<TimeOffRecord | null>(null);
  const [timeOffUnavailable, setTimeOffUnavailable] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingTimeOff, setLoadingTimeOff] = useState(false);
  const [schedule, setSchedule] = useState(normalizeWeeklySchedule());
  const [scheduleError, setScheduleError] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [coveredRoles, setCoveredRoles] = useState<string[]>(staff.coveredRoles ?? []);
  const [specialties, setSpecialties] = useState<string[]>(staff.specialties ?? []);
  const [showOnTeam, setShowOnTeam] = useState(Boolean(staff.showOnTeam));
  const [specialtyError, setSpecialtyError] = useState('');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const photoRef = useRef<ImageUploadHandle | null>(null);
  const dialogRef = useDialogBehavior(onClose);

  // The specialties offered are the service categories, so a staff member is
  // marked against the catalogue the studio actually sells.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const controller = new AbortController();
    apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/services/categories`, {
      signal: controller.signal,
      headers: { ...authHeader(token) },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) return;
        const rows = (payload?.data?.categories ?? []) as Array<{ id: string; name: string; isActive?: boolean }>;
        setCategories(rows.filter((category) => category.isActive !== false).map((category) => ({ id: String(category.id), name: String(category.name) })));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    // The time-off endpoint does not exist on the configured backend.
    setTimeOffUnavailable(true);
    setLoadingTimeOff(false);
  }, []);

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    apiFetch(`${baseUrl}/schedules/staff`, { headers: { Authorization: `Bearer ${getAccessToken()}` } })
      .then(async (response) => {
        const payload = await response.json();
        const staffSchedules = (payload?.data?.staffSchedules ?? []).filter((s: any) => s.staffId === staff.id);
        if (staffSchedules.length > 0) {
          setSchedule(normalizeWeeklySchedule(staffSchedules));
        }
      })
      .catch(() => undefined);
  }, [staff.id]);

  /**
   * Check the fields of the staff editor.
   *
   * A name is checked as a name, the phone number as a Philippine mobile
   * number, and the role as a short piece of text. The values are checked
   * whole, so a pasted value is caught as well as a typed one.
   */
  function collectFieldErrors(form: FormData): Record<string, string> {
    const errors: Record<string, string> = {};
    const firstName = String(form.get('firstName') ?? '').trim();
    const lastName = String(form.get('lastName') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const primaryRole = String(form.get('primaryRole') ?? '').trim();
    if (!firstName) errors.firstName = 'Enter a first name.';
    else if (!isValidPersonName(firstName)) errors.firstName = personNameMessage(firstName);
    if (!lastName) errors.lastName = 'Enter a last name.';
    else if (!isValidPersonName(lastName)) errors.lastName = personNameMessage(lastName);
    if (phone && !isValidPhilippineMobile(phone)) errors.phone = PHONE_MESSAGE;
    if (!primaryRole) errors.primaryRole = 'Enter a primary role.';
    else if (primaryRole.length > 100) errors.primaryRole = 'Keep the role under 100 characters.';
    const position = String(form.get('position') ?? '').trim();
    if (position.length > 100) errors.position = 'Keep the position under 100 characters.';
    const bio = String(form.get('bio') ?? '').trim();
    if (bio.length > 1000) errors.bio = 'Keep the bio under 1000 characters.';
    return errors;
  }

  /** Re-check one field, once the reader has left it. */
  function recheckField(field: string, form: HTMLFormElement | null) {
    if (!form) return;
    if (!Object.prototype.hasOwnProperty.call(fieldErrors, field)) return;
    const errors = collectFieldErrors(new FormData(form));
    setFieldErrors((current) => {
      const next = { ...current };
      if (errors[field]) next[field] = errors[field];
      else delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const errors = collectFieldErrors(form);
    setFieldErrors(errors);
    // Showing a profile on the team page needs at least one specialty, so the
    // page never lists someone with nothing they are known for.
    const specialtyMessage = showOnTeam && specialties.length === 0
      ? 'Select at least one specialty when the profile is shown on the team page.'
      : '';
    setSpecialtyError(specialtyMessage);
    if (Object.keys(errors).length > 0 || specialtyMessage) {
      // The dialog stays open and keeps what was typed.
      for (const field of ['firstName', 'lastName', 'phone', 'primaryRole', 'position', 'bio']) {
        if (!errors[field]) continue;
        event.currentTarget.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
        break;
      }
      return;
    }
    const token = getAccessToken();
    if (!token) { setError('Sign in with an administrator account to edit staff.'); return; }
    setSubmitting(true);
    setError('');
    const lastName = String(form.get('lastName') ?? '').trim();
    try {
      const response = await apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: String(form.get('firstName') ?? '').trim(),
          lastName,
          phone: String(form.get('phone') ?? ''),
          primaryRole: String(form.get('primaryRole') ?? '').trim(),
          employmentType: String(form.get('employmentType')),
          workStatus: String(form.get('workStatus')),
          position: String(form.get('position') ?? '').trim(),
          bio: String(form.get('bio') ?? '').trim(),
          coveredRoles,
          showOnTeam,
          specialties,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to save staff changes.');

      // The photo is stored against the staff row, so it is uploaded after the
      // profile fields are saved.
      if (photoRef.current?.hasPendingFile()) {
        try {
          await photoRef.current.upload(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/staff/${staff.id}/photo`);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'The photo could not be uploaded.');
          setSubmitting(false);
          return;
        }
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save staff changes.');
      setSubmitting(false);
    }
  }

  async function saveSchedule() {
    const token = getAccessToken();
    if (!token) { setError('Sign in with an administrator account to save schedule.'); return; }
    for (const day of schedule) {
      if (day.enabled && (!day.startTime || !day.endTime || !isValidTimeRange(day.startTime, day.endTime))) {
        setScheduleError(`${weekDayLabels[day.dayOfWeek - 1]}: Set valid start and end times (start must be before end).`);
        return;
      }
    }
    setScheduleError('');
    setSavingSchedule(true);
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(`${baseUrl}/schedules/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schedule: schedule.filter((d) => d.enabled).map((d) => ({ dayOfWeek: d.dayOfWeek, startTime: d.startTime, endTime: d.endTime, isActive: true })) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to save schedule.');
      setNotice('Schedule updated.');
    } catch (cause) {
      setScheduleError(cause instanceof Error ? cause.message : 'Unable to save schedule.');
    } finally {
      setSavingSchedule(false);
    }
  }

  function updateScheduleDay(dayOfWeek: number, field: 'enabled' | 'startTime' | 'endTime', value: boolean | string) {
    setSchedule((current) => current.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, [field]: value } : day));
  }

  async function saveTimeOff(values: Omit<TimeOffRecord, 'id' | 'staffId'>, existing: TimeOffRecord | null) {
    const token = getAccessToken();
    if (!token) throw new Error('Sign in with an administrator account to manage time off.');
    const response = await apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/staff/${staff.id}/time-off${existing ? `/${existing.id}` : ''}`, {
      method: existing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? 'Unable to save time off.');
    const saved = payload?.data?.timeOff as TimeOffRecord;
    setTimeOff((current) => (existing
      ? current.map((entry) => entry.id === existing.id ? saved : entry)
      : [...current, saved]).sort((left, right) => left.startDate.localeCompare(right.startDate)));
    setShowTimeOff(false);
    setEditingTimeOff(null);
    setNotice(existing ? 'Time off updated.' : 'Time off added.');
  }

  async function removeTimeOff(entry: TimeOffRecord) {
    const token = getAccessToken();
    if (!token) { setError('Sign in with an administrator account to manage time off.'); return; }
    const response = await apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/staff/${staff.id}/time-off/${entry.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) { setError(payload.message ?? 'Unable to remove time off.'); return; }
    setTimeOff((current) => current.filter((item) => item.id !== entry.id));
    setNotice('Time off removed.');
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="staff-edit-title" onClick={onClose}>
      <section ref={dialogRef} className="modal-card staff-edit-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 id="staff-edit-title">Edit Staff Account</h3>
          <button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="staff-edit-content">
          <form className="staff-account-form" onSubmit={handleSubmit} noValidate>
            <h4>Staff Account Information</h4>
            <p className="form-hint">{staff.email}</p>
            <ImageUploadField ref={photoRef} label="STAFF PHOTO" idPrefix="staff-photo" initialUrl={staff.photoUrl ?? null} />
            <div className="form-grid">
              <label className="field-label">FIRST NAME
                <input className="modal-input" name="firstName" defaultValue={staff.firstName ?? ''} required maxLength={100}
                  autoComplete="given-name"
                  onBlur={(event) => recheckField('firstName', event.currentTarget.form)}
                  {...invalidField('staff-edit-first-name-error', fieldErrors.firstName)} />
                <FieldError id="staff-edit-first-name-error" message={fieldErrors.firstName} />
              </label>
              <label className="field-label">LAST NAME
                <input className="modal-input" name="lastName" defaultValue={staff.lastName ?? ''} required maxLength={100}
                  autoComplete="family-name"
                  onBlur={(event) => recheckField('lastName', event.currentTarget.form)}
                  {...invalidField('staff-edit-last-name-error', fieldErrors.lastName)} />
                <FieldError id="staff-edit-last-name-error" message={fieldErrors.lastName} />
              </label>
            </div>
            <label className="field-label">PHONE
              <input className="modal-input" name="phone" type="tel" defaultValue={staff.phone ?? ''} maxLength={30}
                inputMode="tel" autoComplete="tel"
                onBlur={(event) => recheckField('phone', event.currentTarget.form)}
                {...invalidField('staff-edit-phone-error', fieldErrors.phone)} />
              <FieldError id="staff-edit-phone-error" message={fieldErrors.phone} />
            </label>
            <label className="field-label">PRIMARY ROLE
              <input className="modal-input" name="primaryRole" defaultValue={staff.role} required maxLength={100}
                onBlur={(event) => recheckField('primaryRole', event.currentTarget.form)}
                {...invalidField('staff-edit-primary-role-error', fieldErrors.primaryRole)} />
              <FieldError id="staff-edit-primary-role-error" message={fieldErrors.primaryRole} />
            </label>
            <label className="field-label">POSITION
              <input className="modal-input" name="position" defaultValue={staff.position ?? ''} maxLength={100}
                placeholder="e.g. Senior Stylist"
                onBlur={(event) => recheckField('position', event.currentTarget.form)}
                {...invalidField('staff-edit-position-error', fieldErrors.position)} />
              <FieldError id="staff-edit-position-error" message={fieldErrors.position} />
            </label>
            <label className="field-label">BIO
              <textarea className="modal-input" name="bio" defaultValue={staff.bio ?? ''} rows={3} maxLength={1000}
                placeholder="A short introduction shown on the team page."
                onBlur={(event) => recheckField('bio', event.currentTarget.form)}
                {...invalidField('staff-edit-bio-error', fieldErrors.bio)} />
              <FieldError id="staff-edit-bio-error" message={fieldErrors.bio} />
            </label>
            <TagMultiSelect
              label="COVERED ROLES"
              hint="Roles this staff member can step into. Pick from the list or add your own."
              options={COVERED_ROLE_VOCABULARY}
              value={coveredRoles}
              onChange={setCoveredRoles}
            />
            <CheckboxMultiSelect
              label="SPECIALTIES"
              options={categories}
              value={specialties}
              onChange={(next) => { setSpecialties(next); if (next.length > 0) setSpecialtyError(''); }}
              errorId="staff-edit-specialties-error"
              errorMessage={specialtyError}
            />
            <ToggleSwitch
              label="Show on team page"
              hint="List this staff member on the public team page."
              checked={showOnTeam}
              onChange={(next) => {
                setShowOnTeam(next);
                if (!next) setSpecialtyError('');
              }}
            />
            <div className="form-grid">
              <label className="field-label">EMPLOYMENT TYPE<select className="modal-input" name="employmentType" defaultValue={staff.employment === 'Part Time' ? 'PART_TIME' : 'FULL_TIME'}><option value="FULL_TIME">Full Time</option><option value="PART_TIME">Part Time</option></select></label>
              <label className="field-label">WORK STATUS<select className="modal-input" name="workStatus" defaultValue={staff.status === 'Active' ? 'ON_DUTY' : staff.status === 'On Vacation' ? 'UNAVAILABLE' : 'DAY_OFF'}><option value="ON_DUTY">On Duty</option><option value="DAY_OFF">Day Off</option><option value="UNAVAILABLE">Unavailable</option></select></label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary-action" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>

          <div className="panel time-off-panel">
            <div className="panel-header"><div><h4>Vacation &amp; Day Off</h4><p>Set date-based availability for this staff account.</p></div><button type="button" className="primary-button" disabled={timeOffUnavailable} onClick={() => { setEditingTimeOff(null); setShowTimeOff(true); }}>+ Add Vacation / Day Off</button></div>
            {timeOffUnavailable && <p className="form-hint">Date-specific time off is not supported by the configured backend. The development demo stores these entries locally.</p>}
            {loadingTimeOff && (
              <SkeletonRegion label="Loading time-off entries">
                <ListSkeleton rows={2} />
              </SkeletonRegion>
            )}
            {!loadingTimeOff && timeOff.length === 0 && <p className="empty-list">No vacation or day-off entries recorded.</p>}
            {timeOff.length > 0 && <div className="time-off-list">{timeOff.map((entry) => (
              <div className="time-off-row" key={entry.id}>
                <div><strong>{entry.type === 'VACATION' ? 'Vacation' : 'Day Off'}</strong><span>{entry.startDate === entry.endDate ? entry.startDate : `${entry.startDate} – ${entry.endDate}`}{entry.startTime && entry.endTime ? ` · ${entry.startTime}–${entry.endTime}` : ' · All day'}</span></div>
                <button type="button" className="link-button" disabled={timeOffUnavailable} onClick={() => { setEditingTimeOff(entry); setShowTimeOff(true); }}>Edit</button>
                <button type="button" className="link-button danger-link" disabled={timeOffUnavailable} onClick={() => void removeTimeOff(entry)}>Remove</button>
              </div>
            ))}</div>}
            {notice && <p className="table-message" role="status">{notice}</p>}
            {showTimeOff && <TimeOffModal entry={editingTimeOff} onClose={() => { setShowTimeOff(false); setEditingTimeOff(null); }} onSave={saveTimeOff} />}
          </div>
          <div className="panel scheduling-rules-panel">
            <div className="panel-header">
              <div>
                <h4>Scheduling Rules</h4>
                <p>The hours this staff member is available each week.</p>
              </div>
            </div>
            <div className="staff-schedule-section">
              <span className="field-label">WEEKLY SCHEDULE</span>
              <div className="schedule-grid">
                {schedule.map((day) => (
                  <div key={day.dayOfWeek} className={`schedule-day${day.enabled ? ' enabled' : ''}`}>
                    <label className="schedule-day-header">
                      <input type="checkbox" checked={day.enabled} onChange={(e) => updateScheduleDay(day.dayOfWeek, 'enabled', e.target.checked)} />
                      <span>{weekDayLabels[day.dayOfWeek - 1]}</span>
                    </label>
                    {day.enabled && (
                      /* Each field carries its own visible label. A native
                         time control shows only the digits, so without a
                         label the administrator cannot tell which of the two
                         fields is the start and which is the end. */
                      <div className="schedule-day-times">
                        <label className="schedule-time-field">
                          <span className="schedule-time-label">Start</span>
                          <input type="time" className="modal-input" value={day.startTime} onChange={(e) => updateScheduleDay(day.dayOfWeek, 'startTime', e.target.value)} aria-label={`${weekDayLabels[day.dayOfWeek - 1]} start time`} />
                        </label>
                        <label className="schedule-time-field">
                          <span className="schedule-time-label">End</span>
                          <input type="time" className="modal-input" value={day.endTime} onChange={(e) => updateScheduleDay(day.dayOfWeek, 'endTime', e.target.value)} aria-label={`${weekDayLabels[day.dayOfWeek - 1]} end time`} />
                        </label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {scheduleError && <p className="form-error" role="alert">{scheduleError}</p>}
              <button type="button" className="secondary-action" onClick={saveSchedule} disabled={savingSchedule}>{savingSchedule ? 'Saving…' : 'Save Schedule'}</button>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}

function TimeOffModal({ entry, onClose, onSave }: {
  entry: TimeOffRecord | null;
  onClose: () => void;
  onSave: (values: Omit<TimeOffRecord, 'id' | 'staffId'>, existing: TimeOffRecord | null) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useDialogBehavior<HTMLFormElement>(onClose);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('startDate') ?? '');
    const endDate = String(form.get('endDate') ?? '');
    const startTime = String(form.get('startTime') ?? '') || null;
    const endTime = String(form.get('endTime') ?? '') || null;
    if (!startDate || !endDate) { setError('Enter both the start date and the end date.'); return; }
    if (startDate > endDate) { setError('The end date must be on or after the start date.'); return; }
    if ((startTime === null) !== (endTime === null)) { setError('Enter both start and end times, or leave both blank for all day.'); return; }
    if (startTime && endTime && !isValidTimeRange(startTime, endTime)) { setError(TIME_RANGE_MESSAGE); return; }
    setBusy(true);
    setError('');
    try {
      await onSave({
        type: String(form.get('type')) as TimeOffRecord['type'],
        startDate,
        endDate,
        startTime,
        endTime,
      }, entry);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save time off.');
      setBusy(false);
    }
  }
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="time-off-title" onClick={onClose}>
      <form ref={dialogRef} className="modal-card service-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()} noValidate>
        <div className="modal-header"><h3 id="time-off-title">{entry ? 'Edit Time Off' : 'Add Vacation / Day Off'}</h3><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
        <label className="field-label">TYPE<select className="modal-input" name="type" defaultValue={entry?.type ?? 'VACATION'}><option value="VACATION">Vacation</option><option value="DAY_OFF">Day Off</option></select></label>
        <div className="form-grid">
          <label className="field-label">START DATE<input className="modal-input" name="startDate" type="date" defaultValue={entry?.startDate ?? ''} required /></label>
          <label className="field-label">END DATE<input className="modal-input" name="endDate" type="date" defaultValue={entry?.endDate ?? ''} required /></label>
        </div>
        <p className="form-hint">Leave both time fields blank to block the full day.</p>
        <div className="form-grid">
          <label className="field-label">START TIME<input className="modal-input" name="startTime" type="time" defaultValue={entry?.startTime ?? ''} /></label>
          <label className="field-label">END TIME<input className="modal-input" name="endTime" type="time" defaultValue={entry?.endTime ?? ''} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-action" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary-action" disabled={busy}>{busy ? 'Saving…' : entry ? 'Save Changes' : 'Add Time Off'}</button></div>
      </form>
    </div>
  );
}

function AppointmentPage() {
  const [appointments, setAppointments, appointmentsLoading] = useAppointmentData();
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRow | null>(null);
  const [confirmation, setConfirmation] = useState<{ appointment: AppointmentRow; status: string } | null>(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'other' | (typeof SIDEBAR_STATUS_ORDER)[number]>('all');
  const token = getAccessToken();
  const navigate = useNavigate();
  const closeAppointmentDetail = useCallback(() => setSelectedAppointment(null), []);
  const appointmentDialogRef = useDialogBehavior<HTMLElement>(closeAppointmentDetail, selectedAppointment !== null);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const calendarCells = Array.from({ length: Math.ceil((monthStart.getDay() + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - monthStart.getDay() + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const todayKey = localDateKey(new Date());
  const daysInMonthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const monthAppointments = appointments.filter((item) => item.appointmentDate.startsWith(daysInMonthPrefix));
  const monthStatusSequence = ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESERVED', 'NO_SHOW'] as const;
  const monthStatusCounts = new Map(monthStatusSequence.map((status) => [status, monthAppointments.filter((item) => item.status === status).length]));
  // The axis is every day of the selected month, so the line shows how the
  // month fills in rather than a summary of what it ended up as.
  const monthAxis: LineAxisPoint[] = (() => {
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        key,
        label: String(day),
        fullLabel: new Date(month.getFullYear(), month.getMonth(), day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      };
    });
  })();
  // One line per state that actually occurs in the month, so there is no
  // flat line sitting on the baseline for a state that never happens. Each
  // line takes the colour of the badge for that state.
  const monthStatusSeries: LineSeries[] = monthStatusSequence
    .filter((status) => (monthStatusCounts.get(status) ?? 0) > 0)
    .map((status) => ({
      key: status,
      label: appointmentStatusText(status),
      color: `--chart-${APPOINTMENT_CHART_COLOR[status] ?? status.toLowerCase()}`,
      values: Object.fromEntries(monthAxis.map((point) => [
        point.key,
        monthAppointments.filter((item) => item.appointmentDate === point.key && item.status === status).length,
      ])),
    }));
  const selectedAppointments = appointments
    .filter((item) => item.appointmentDate === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const allAppointments = [...appointments].sort((a, b) => {
    const dateCompare = a.appointmentDate.localeCompare(b.appointmentDate);
    return dateCompare !== 0 ? dateCompare : a.startTime.localeCompare(b.startTime);
  });
  const sidebarSections = SIDEBAR_STATUS_ORDER
    .map((status) => ({ status, items: allAppointments.filter((appt) => appt.status === status) }))
    .filter((section) => section.items.length > 0);
  const unlistedAppointments = allAppointments.filter((appt) => !(SIDEBAR_STATUS_ORDER as readonly string[]).includes(appt.status));
  const sidebarFilterButtons = [
    { key: 'all' as const, label: 'All', count: allAppointments.length },
    ...(unlistedAppointments.length > 0 ? [{ key: 'other' as const, label: 'Other', count: unlistedAppointments.length }] : []),
    ...SIDEBAR_STATUS_ORDER.map((status) => ({
      key: status as (typeof SIDEBAR_STATUS_ORDER)[number] | 'other',
      label: appointmentStatusText(status),
      count: allAppointments.filter((appt) => appt.status === status).length,
    })),
  ];
  const visibleSections: { status: (typeof SIDEBAR_STATUS_ORDER)[number] | null; items: AppointmentRow[] }[] =
    statusFilter === 'all'
      ? [...sidebarSections, ...(unlistedAppointments.length > 0 ? [{ status: null as null, items: unlistedAppointments }] : [])]
      : statusFilter === 'other'
        ? [{ status: null as null, items: unlistedAppointments }]
        : sidebarSections.filter((section) => section.status === statusFilter);

  function handleSidebarClick(appointment: AppointmentRow) {
    setSelectedDate(appointment.appointmentDate);
    const date = new Date(`${appointment.appointmentDate}T12:00:00`);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectedAppointment(appointment);
  }

  async function changeAppointmentStatus(appointment: AppointmentRow, status: string) {
    if (!appointment.id || !token) {
      setMessage('Sign in with an administrator account to update appointments.');
      return;
    }
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(`${baseUrl}/appointments/${appointment.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to update appointment status.');
      const updated = { ...appointment, status: payload.data.appointment.status };
      setAppointments((current) => current.map((item) => item.id === appointment.id ? updated : item));
      setSelectedAppointment((current) => current?.id === appointment.id ? updated : current);
      setConfirmation(null);
      setMessage(`Appointment ${appointment.code} updated to ${appointmentStatusText(status).toLowerCase()}.`);
    } catch (cause) {
      throw cause instanceof Error ? cause : new Error('Unable to update appointment status.');
    }
  }

  function moveCalendarMonth(offset: number) {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(nextMonth);
    setSelectedDate(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`);
  }

  function handleComplete(appointment: AppointmentRow) {
    navigate('/payments', { state: { completeAppointmentId: appointment.id, appointmentCode: appointment.code } });
  }

  return (
    <div className="appointment-layout">
      <aside className="appointment-sidebar">
        <div className="sidebar-filters" role="group" aria-label="Filter appointments by status">
          {sidebarFilterButtons.map((button) => (
            <button
              key={button.key}
              type="button"
              className={statusFilter === button.key ? 'active' : ''}
              aria-pressed={statusFilter === button.key}
              onClick={() => setStatusFilter(button.key)}
            >
              {button.label}{appointmentsLoading ? '' : ` (${button.count})`}
            </button>
          ))}
        </div>
        {appointmentsLoading && (
          <SkeletonRegion label="Loading appointments by status">
            <ListSkeleton rows={3} />
          </SkeletonRegion>
        )}
        {!appointmentsLoading && visibleSections.length === 0 && <p className="empty-list">{statusFilter === 'all' ? 'No appointments scheduled yet.' : 'No appointments match this filter.'}</p>}
        {visibleSections.map((section) => (
          <section key={section.status ?? 'other'} className="sidebar-status-section">
            <div className="sidebar-status-header">
              <span className={`status-badge ${section.status ? appointmentStatusBadge(section.status) : 'status-noshow'}`}>
                {section.status ? appointmentStatusText(section.status) : 'Other'}
              </span>
              <span className="sidebar-status-count">
                {section.items.length} {section.status ? appointmentStatusText(section.status).toLowerCase() : 'other'}
                {' '}{section.items.length === 1 ? 'appointment' : 'appointments'}
              </span>
            </div>
            <div className="sidebar-appointment-list">
              {section.items.map((appt) => (
                <button key={appt.code} type="button" className="sidebar-appointment-item" onClick={() => handleSidebarClick(appt)}>
                  <div>
                    <strong>{appt.customerName || 'Customer'}</strong>
                    <small>{appt.appointmentDate} · {appt.startTime}</small>
                    <small>{appt.staffName || 'Staff'}</small>
                  </div>
                  <span>
                    <span className={`status-badge ${appointmentStatusBadge(appt.status)}`}>{appointmentStatusText(appt.status)}</span>
                    {isPastNonterminal(appt, todayKey) && <span className="past-review-tag">Past — needs review</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </aside>
      <section className="panel calendar-panel">
        <div className="calendar-header-row">
          <button type="button" className="tiny-button" aria-label="Previous month" onClick={() => moveCalendarMonth(-1)}>‹</button>
          <strong>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" className="tiny-button" aria-label="Next month" onClick={() => moveCalendarMonth(1)}>›</button>
        </div>
        <p className="calendar-month-summary" aria-live="polite">
          {appointmentsLoading ? (
            <Skeleton width="13rem" height={11} />
          ) : (
            <strong>{monthAppointments.length === 0
              ? 'No appointments this month'
              : `${monthAppointments.length} ${monthAppointments.length === 1 ? 'appointment' : 'appointments'} this month`}</strong>
          )}
        </p>
        {appointmentsLoading ? (
          <SkeletonRegion label="Loading the calendar">
            <CalendarSkeleton weeks={Math.ceil(calendarCells.length / 7)} />
          </SkeletonRegion>
        ) : (
        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="weekday-label">{day}</div>)}
          {calendarCells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="day-cell empty-day" />;
            const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayAppointments = appointments.filter((item) => item.appointmentDate === date);
            const cancelledCount = dayAppointments.filter((item) => item.status === 'CANCELLED').length;
            return (
              <button
                type="button"
                key={date}
                className={`day-cell${selectedDate === date ? ' active' : ''}${date === todayKey ? ' today' : ''}`}
                aria-pressed={selectedDate === date}
                aria-current={date === todayKey ? 'date' : undefined}
                aria-label={`${date}${date === todayKey ? ', today' : ''}${dayAppointments.length ? `, ${dayAppointments.length} ${dayAppointments.length === 1 ? 'appointment' : 'appointments'}` : ', no appointments'}`}
                onClick={() => setSelectedDate(date)}
              >
                <span>{day}{date === todayKey && <span className="today-dot" aria-hidden="true" />}</span>
                {dayAppointments.length > 0 && <small>{dayAppointments.length} {dayAppointments.length === 1 ? 'booking' : 'bookings'}</small>}
                {cancelledCount > 0 && <small className="calendar-cancelled">{cancelledCount} cancelled</small>}
              </button>
            );
          })}
        </div>
        )}
      </section>

      <section className="panel selected-day-panel">
          <div className="panel-header compact">
            <h3>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</h3>
            {!appointmentsLoading && <span>{selectedAppointments.length} {selectedAppointments.length === 1 ? 'appointment' : 'appointments'}</span>}
          </div>
          {appointmentsLoading && (
            <SkeletonRegion label="Loading the selected day's bookings">
              <ListSkeleton rows={3} />
            </SkeletonRegion>
          )}
          {!appointmentsLoading && selectedAppointments.map((appointment) => (
            <button type="button" key={appointment.code} className="selected-appointment" onClick={() => setSelectedAppointment(appointment)}>
              <span>
                <strong>{appointment.customerName || 'Customer'} · {appointment.staffName || 'Staff'}</strong>
                <small>{appointment.serviceNames} · {appointment.startTime}–{appointment.endTime} · {appointment.code}</small>
                <small className="past-review-tag-wrap">{isPastNonterminal(appointment, todayKey) && <span className="past-review-tag">Past — needs review</span>}</small>
              </span>
              <span className={`status-badge ${appointmentStatusBadge(appointment.status)}`}>{appointmentStatusText(appointment.status)}</span>
            </button>
          ))}
          {!appointmentsLoading && selectedAppointments.length === 0 && <p className="empty-list">No appointments scheduled for this date.</p>}
          {message && <p className="table-message" role="status">{message}</p>}
      </section>

      <section className="panel month-trend-panel">
        <div className="panel-header compact">
          <h3>Appointments through {month.toLocaleDateString('en-US', { month: 'long' })}</h3>
          <span>Daily, by status</span>
        </div>
        {appointmentsLoading ? (
          <SkeletonRegion label="Loading the month's appointments">
            <ChartSkeleton height={190} />
          </SkeletonRegion>
        ) : (
          <LineChart
            axis={monthAxis}
            series={monthStatusSeries}
            unit="appointments"
            metricName="Appointments"
            emptyMessage="No appointments are recorded in this month."
            height={190}
            area={false}
          />
        )}
        <DataOriginNote>Read from the {month.toLocaleDateString('en-US', { month: 'long' })} appointment records on this page.</DataOriginNote>
      </section>
      {selectedAppointment && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title" onClick={closeAppointmentDetail}>
          <section ref={appointmentDialogRef} className="modal-card appointment-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><h3 id="appointment-detail-title">Appointment Details</h3><button type="button" className="close-button" aria-label="Close appointment details" onClick={() => setSelectedAppointment(null)}>×</button></div>
            <dl className="appointment-detail-list">
              <div><dt>Booking reference</dt><dd>{selectedAppointment.code}</dd></div>
              <div><dt>Customer</dt><dd>{selectedAppointment.customerName || 'Customer'}{selectedAppointment.customerEmail ? ` · ${selectedAppointment.customerEmail}` : ''}</dd></div>
              {selectedAppointment.customerPhone && <div><dt>Phone</dt><dd>{selectedAppointment.customerPhone}</dd></div>}
              <div><dt>Service</dt><dd>{selectedAppointment.serviceNames}</dd></div>
              <div><dt>Staff</dt><dd>{selectedAppointment.staffName || 'Staff not assigned'}</dd></div>
              <div><dt>Date &amp; time</dt><dd>{new Date(`${selectedAppointment.appointmentDate}T12:00:00`).toLocaleDateString()} · {selectedAppointment.startTime}–{selectedAppointment.endTime}</dd></div>
              {selectedAppointment.totalAmount !== undefined && <div><dt>Total</dt><dd>₱{Number(selectedAppointment.totalAmount).toLocaleString()}</dd></div>}
              <div><dt>Status</dt><dd><span className={`status-badge ${appointmentStatusBadge(selectedAppointment.status)}`}>{appointmentStatusText(selectedAppointment.status)}</span>{isPastNonterminal(selectedAppointment, todayKey) && <span className="past-review-tag">Past — needs review</span>}</dd></div>
            </dl>
            {!token && <p className="form-hint">Sign in with an administrator account to update appointments.</p>}
            <div className="modal-actions appointment-detail-actions">
              {selectedAppointment.status === 'CONFIRMED' && (
                <>
                  <button type="button" className="reject-action" disabled={!token || !selectedAppointment.id} onClick={() => setConfirmation({ appointment: selectedAppointment, status: 'CANCELLED' })}>Cancel</button>
                  <button type="button" className="primary-action" disabled={!token || !selectedAppointment.id} onClick={() => handleComplete(selectedAppointment)}>Complete</button>
                </>
              )}
              <button type="button" className="secondary-action" onClick={() => setSelectedAppointment(null)}>Close</button>
            </div>
          </section>
        </div>
      )}
      {confirmation && (
        <ConfirmModal
          title="Cancel appointment?"
          message={`Cancel ${confirmation.appointment.code}? This will update the appointment across the calendar and payment views.`}
          confirmLabel="Cancel appointment"
          danger={true}
          onClose={() => setConfirmation(null)}
          onConfirm={() => changeAppointmentStatus(confirmation.appointment, confirmation.status)}
          onError={setMessage}
        />
      )}
    </div>
  );
}

function PaymentPage() {
  const [payments, setPayments] = useState<Array<Record<string, any>>>([]);
  const [activities, setActivities] = useState<Array<{ id: string; message: string; createdAt: string }>>([]);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [search, setSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [paymentConfirmation, setPaymentConfirmation] = useState<'VERIFIED' | 'REJECTED' | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const token = getAccessToken();
  const navigate = useNavigate();
  const location = useLocation();
  const closePaymentModal = useCallback(() => setSelectedPayment(null), []);
  const paymentDialogRef = useDialogBehavior<HTMLElement>(closePaymentModal, selectedPayment !== null);

  useEffect(() => {
    const state = location.state as { completeAppointmentId?: string; appointmentCode?: string } | null;
    if (state?.completeAppointmentId && payments.length > 0) {
      const payment = payments.find((p) => p.appointmentId === state.completeAppointmentId);
      if (payment) {
        setSelectedPayment(payment);
      }
    }
  }, [location.state, payments]);

  async function loadPayments(signal?: AbortSignal) {
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const [paymentResponse, activityResponse] = await Promise.all([
      apiFetch(`${baseUrl}/payments?page=1&limit=100`, { signal, headers }),
      apiFetch(`${baseUrl}/payments/activity`, { signal, headers }),
    ]);
    const paymentPayload = await paymentResponse.json();
    if (!paymentResponse.ok) throw new Error(paymentPayload.message ?? 'Payment records are not available from the configured backend.');
    const activityPayload = activityResponse.ok ? await activityResponse.json() : { data: { activities: [] } };
    setPayments(paymentPayload?.data?.payments ?? []);
    setActivities(activityPayload?.data?.activities ?? []);
  }

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    loadPayments(controller.signal).catch((cause) => {
      if (!controller.signal.aborted) setNotice(cause instanceof Error ? cause.message : 'Unable to load payment records.');
    });
    return () => controller.abort();
  }, []);

  async function updatePaymentStatus(status: 'VERIFIED' | 'REJECTED') {
    if (!selectedPayment) return;
    if (!token) {
      setNotice('Sign in with an administrator account to verify payments.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(`${baseUrl}/payments/${selectedPayment.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to update payment status.');
      setPayments((current) => current.map((payment) => payment.id === selectedPayment.id ? payload.data.payment : payment));
      const activityResponse = await apiFetch(`${baseUrl}/payments/activity`, { headers: { Authorization: `Bearer ${token}` } });
      if (activityResponse.ok) {
        const activityPayload = await activityResponse.json();
        setActivities(activityPayload?.data?.activities ?? []);
      }
      setSelectedPayment(null);
      setPaymentConfirmation(null);
      setNotice(`Payment ${selectedPayment.appointmentCode} ${status === 'VERIFIED' ? 'verified' : 'rejected'}.`);
      setVerificationCode('');
    } catch (cause) {
      throw cause instanceof Error ? cause : new Error('Unable to update payment status.');
    } finally {
      setBusy(false);
    }
  }

  function validatePaymentCode() {
    if (!/^\d{5}$/.test(verificationCode.trim())) {
      setCodeError('Enter the five-digit code provided with this appointment.');
      return;
    }
    if (verificationCode.trim() !== String(selectedPayment?.verificationCode ?? '')) {
      setCodeError('That code does not match this appointment. Check the booking reference and try again.');
      return;
    }
    setCodeError('');
    setPaymentConfirmation('VERIFIED');
  }

  const pendingPayments = payments.filter((payment) => payment.status === 'UNVERIFIED');
  const historyPayments = payments.filter((payment) => payment.status !== 'UNVERIFIED');
  const paymentToday = new Date();
  const todayKey = `${paymentToday.getFullYear()}-${String(paymentToday.getMonth() + 1).padStart(2, '0')}-${String(paymentToday.getDate()).padStart(2, '0')}`;
  const confirmedToday = payments.filter((payment) => payment.status === 'VERIFIED' && String(payment.verifiedAt ?? '').slice(0, 10) === todayKey);
  const displayedPayments = (tab === 'pending' ? pendingPayments : historyPayments).filter((payment) =>
    `${payment.appointmentCode} ${payment.customerName} ${payment.customerEmail} ${payment.serviceName}`.toLowerCase().includes(search.toLowerCase()),
  );
  const confirmedRevenue = payments.filter((payment) => payment.status === 'VERIFIED').reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

  return (
    <div className="payment-layout">
      <section className="payment-content">
        <div className="payment-stats">
          <div className="payment-stat"><span className="status-badge warning">Needs action</span><strong>{pendingPayments.length}</strong><small>Pending payments</small></div>
          <div className="payment-stat"><span className="status-badge success">Settled</span><strong>{confirmedToday.length}</strong><small>Confirmed today</small></div>
          <div className="payment-stat"><span className="status-badge neutral">Review</span><strong>{payments.filter((payment) => payment.status === 'REJECTED').length}</strong><small>Rejected</small></div>
          <div className="payment-stat"><span className="status-badge warning">Revenue</span><strong>₱{confirmedRevenue.toLocaleString()}</strong><small>Revenue confirmed</small></div>
        </div>

        <section className="panel payment-table-panel">
          <div className="payment-tabs">
            <div className="tab-group">
              <button type="button" className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>Pending Queue <span>{pendingPayments.length}</span></button>
              <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Payment History</button>
            </div>
            <input aria-label="Search payments" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by reference or customer..." className="search-input" />
          </div>
          {notice && <p className="table-message" role="status">{notice}</p>}
          {payments.length === 0 ? (
            <div className="payment-unavailable">
              <strong>Payments API unavailable</strong>
              <p>{notice || 'The configured backend does not expose payment records. No demo payments are mixed into live data.'}</p>
            </div>
          ) : (
            <div className="payment-table-scroll">
              <table role="table" className="responsive-table">
                <thead role="rowgroup"><tr><th role="columnheader" scope="col">Reference / Customer</th><th role="columnheader" scope="col">Service</th><th role="columnheader" scope="col">Amount</th><th role="columnheader" scope="col">Booking</th><th role="columnheader" scope="col">Payment</th><th role="columnheader" scope="col">Action</th></tr></thead>
                <tbody role="rowgroup">
                  {displayedPayments.map((payment) => (
                    <tr role="row" key={payment.id}>
                      <td role="cell" data-label="Reference / Customer" data-primary><div className="payment-customer"><strong>{payment.customerName}</strong><small>{payment.appointmentCode} · {payment.customerEmail}</small></div></td>
                      <td role="cell" data-label="Service">{payment.serviceName}</td>
                      <td role="cell" data-label="Amount"><strong>₱{Number(payment.amount).toLocaleString()}</strong><small className="payment-method">{payment.paymentMethod}</small></td>
                      <td role="cell" data-label="Booking"><span className={`status-badge ${appointmentStatusBadge(String(payment.bookingStatus ?? 'RESERVED'))}`}>{appointmentStatusText(String(payment.bookingStatus ?? 'RESERVED'))}</span></td>
                      <td role="cell" data-label="Payment"><span className={`status-badge ${payment.status === 'VERIFIED' ? 'success' : payment.status === 'REJECTED' ? 'danger' : 'warning'}`}>{payment.status === 'VERIFIED' ? 'Verified' : payment.status === 'REJECTED' ? 'Rejected' : 'Pending'}</span></td>
                      <td className="cell-actions" role="cell" data-label="Action">{payment.status === 'UNVERIFIED'
                        ? <button type="button" className="payment-action approve-action" disabled onClick={() => { setSelectedPayment(payment); setVerificationCode(''); setCodeError(''); }}>Verify</button>
                        : <span className="payment-date">{payment.verifiedAt ? new Date(payment.verifiedAt).toLocaleDateString() : '—'}</span>}</td>
                    </tr>
                  ))}
                  {displayedPayments.length === 0 && <tr role="row"><td colSpan={6} className="cell-empty" role="cell" data-empty>{payments.length ? 'No payments match this view.' : 'No payment records are available.'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel payment-activity">
          <div className="panel-header compact"><h3>Payment Activity Log</h3><span>Verification history</span></div>
          {activities.length ? (
            <ul className="payment-activity-list">
              {activities.slice(0, 6).map((activity) => (
                <li key={activity.id}><strong>{activity.message}</strong><small>{new Date(activity.createdAt).toLocaleString()}</small></li>
              ))}
            </ul>
          ) : <p className="empty-list">Payment activity will appear here when payments are verified or rejected.</p>}
        </section>
      </section>

      {selectedPayment && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="verify-payment-title" onClick={closePaymentModal}>
          <section ref={paymentDialogRef} className="modal-card payment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><h3 id="verify-payment-title">Verify payment</h3><button type="button" className="close-button" aria-label="Close payment verification" onClick={() => setSelectedPayment(null)}>×</button></div>
            <p className="form-hint">Enter the five-digit payment code supplied for this appointment. This development verification does not process a real payment.</p>
            <dl className="payment-details">
              <div><dt>Reference</dt><dd>{selectedPayment.appointmentCode}</dd></div>
              <div><dt>Customer</dt><dd>{selectedPayment.customerName}</dd></div>
              <div><dt>Service</dt><dd>{selectedPayment.serviceName}</dd></div>
              <div><dt>Amount</dt><dd>₱{Number(selectedPayment.amount).toLocaleString()}</dd></div>
              <div><dt>Method</dt><dd>{selectedPayment.paymentMethod}</dd></div>
            </dl>
                        {codeError && <p id="payment-code-error" className="form-error" role="alert">{codeError}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setSelectedPayment(null)}>Cancel</button>
              <button type="button" className="reject-action" disabled onClick={() => setPaymentConfirmation('REJECTED')}>Reject</button>
              <button type="button" className="primary-action" disabled={busy} onClick={validatePaymentCode}>Validate code</button>
            </div>
          </section>
        </div>
      )}
      {paymentConfirmation && selectedPayment && (
        <ConfirmModal
          title={paymentConfirmation === 'VERIFIED' ? 'Confirm payment?' : 'Reject payment?'}
          message={paymentConfirmation === 'VERIFIED' ? `The code matches ${selectedPayment.appointmentCode}. Record ₱${Number(selectedPayment.amount).toLocaleString()} as verified in the development demo?` : `Reject the payment for ${selectedPayment.appointmentCode}? This changes only the development demo record.`}
          confirmLabel={paymentConfirmation === 'VERIFIED' ? 'Confirm payment' : 'Reject payment'}
          danger={paymentConfirmation === 'REJECTED'}
          onClose={() => setPaymentConfirmation(null)}
          onConfirm={() => updatePaymentStatus(paymentConfirmation)}
          onError={setNotice}
        />
      )}
    </div>
  );
}

function PaymentVerificationPage() {
  const { paymentId = '' } = useParams();
  const navigate = useNavigate();
  const token = getAccessToken();
  const [payment, setPayment] = useState<any | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [status, setStatus] = useState<'VERIFIED' | 'REJECTED' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!paymentId) return;
    async function loadPayment() {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await apiFetch(`${baseUrl}/payments?page=1&limit=100`, { headers });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to load payment details.');
      const match = (payload?.data?.payments ?? []).find((item: any) => String(item.id) === paymentId);
      if (!match) throw new Error('Payment record not found.');
      setPayment(match);
    }

    loadPayment().catch((cause) => {
      setNotice(cause instanceof Error ? cause.message : 'Unable to load payment details.');
    });
  }, [paymentId, token]);

  async function updatePaymentStatus(nextStatus: 'VERIFIED' | 'REJECTED') {
    if (!payment) return;
    if (!token) {
      setNotice('Sign in with an administrator account to verify payments.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(`${baseUrl}/payments/${payment.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to update payment status.');
      setNotice(nextStatus === 'VERIFIED' ? 'Payment verified.' : 'Payment rejected.');
      setStatus(null);
      setTimeout(() => navigate('/payments', { state: { message: nextStatus === 'VERIFIED' ? 'Payment verified.' : 'Payment rejected.' } }), 150);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Unable to update payment status.');
    } finally {
      setBusy(false);
    }
  }

  function validatePaymentCode() {
    if (!payment) return;
    if (!/^\d{5}$/.test(verificationCode.trim())) {
      setCodeError('Enter the five-digit code provided with this appointment.');
      return;
    }
    if (verificationCode.trim() !== String(payment.verificationCode ?? '')) {
      setCodeError('That code does not match this appointment. Check the booking reference and try again.');
      return;
    }
    setCodeError('');
    setStatus('VERIFIED');
  }

  if (!payment) {
    return (
      <section className="panel payment-verify-page">
        <div className="panel-header compact"><h3>Payment verification</h3></div>
        {notice ? <p className="form-error" role="alert">{notice}</p> : <p className="empty-list">Loading payment details…</p>}
      </section>
    );
  }

  return (
    <section className="panel payment-verify-page">
      <div className="panel-header compact">
        <div><h3>Verify payment</h3><p>Review the booking details and validate the reference code before recording the result.</p></div>
        <button type="button" className="secondary-action" onClick={() => navigate('/payments')}>Back to payments</button>
      </div>
      <div className="payment-verify-grid">
        <dl className="payment-details">
          <div><dt>Reference</dt><dd>{payment.appointmentCode}</dd></div>
          <div><dt>Customer</dt><dd>{payment.customerName}</dd></div>
          <div><dt>Service</dt><dd>{payment.serviceName}</dd></div>
          <div><dt>Amount</dt><dd>₱{Number(payment.amount).toLocaleString()}</dd></div>
          <div><dt>Method</dt><dd>{payment.paymentMethod}</dd></div>
          <div><dt>Status</dt><dd>{payment.status === 'VERIFIED' ? 'Verified' : payment.status === 'REJECTED' ? 'Rejected' : 'Pending verification'}</dd></div>
        </dl>
        <div className="payment-verify-form">
          <label className="field-label payment-code-field">PAYMENT CODE<input className="modal-input" inputMode="numeric" autoComplete="off" maxLength={5} value={verificationCode} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 5)); setCodeError(''); }} aria-describedby={codeError ? 'payment-code-error' : undefined} /></label>
          {codeError && <p id="payment-code-error" className="form-error" role="alert">{codeError}</p>}
          {notice && <p className="table-message" role="status">{notice}</p>}
          <div className="modal-actions">
            <button type="button" className="reject-action" disabled={!token || busy} onClick={() => updatePaymentStatus('REJECTED')}>Reject</button>
            <button type="button" className="primary-action" disabled={!token || busy} onClick={validatePaymentCode}>Validate code</button>
          </div>
          {status === 'VERIFIED' && (
            <div className="verify-confirmation-box">
              <p>The code matches this booking. Record this payment as verified?</p>
              <button type="button" className="approve-action" disabled={busy} onClick={() => updatePaymentStatus('VERIFIED')}>Confirm payment</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AccountCreationModal({ onClose }: { onClose: () => void }) {
  const [selectedRole, setSelectedRole] = useState<'Manager' | 'Staff'>('Manager');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; title: string; message: string } | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<StaffCredentials | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [schedule, setSchedule] = useState(normalizeWeeklySchedule());
  const [scheduleError, setScheduleError] = useState('');
  const [copied, setCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [coveredRoles, setCoveredRoles] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [showOnTeam, setShowOnTeam] = useState(false);
  const [specialtyError, setSpecialtyError] = useState('');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const photoRef = useRef<ImageUploadHandle | null>(null);
  const dialogRef = useDialogBehavior<HTMLFormElement>(onClose);

  // The specialties offered are the service categories, so a staff member is
  // marked against the catalogue the studio actually sells.
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const controller = new AbortController();
    apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/services/categories`, {
      signal: controller.signal,
      headers: { ...authHeader(token) },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) return;
        const rows = (payload?.data?.categories ?? []) as Array<{ id: string; name: string; isActive?: boolean }>;
        setCategories(rows.filter((category) => category.isActive !== false).map((category) => ({ id: String(category.id), name: String(category.name) })));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  function validatePasswordStrength(value: string): boolean {
    return isValidPassword(value);
  }

  /**
   * Check the fields of this form.
   *
   * Each field is checked by its own rule: a name is a name, an address is
   * an address and a password is a password. The value is checked whole, so
   * a pasted value is caught as well as a typed one, and the message for
   * each field is returned with it.
   */
  function collectFieldErrors(form: FormData): Record<string, string> {
    const errors: Record<string, string> = {};
    const firstName = String(form.get('firstName') ?? '').trim();
    const lastName = String(form.get('lastName') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    if (!firstName) errors.firstName = 'Enter a first name.';
    else if (!isValidPersonName(firstName)) errors.firstName = personNameMessage(firstName);
    if (!lastName) errors.lastName = 'Enter a last name.';
    else if (!isValidPersonName(lastName)) errors.lastName = personNameMessage(lastName);
    // A new account is given a Gmail address.
    const emailError = accountEmailError(email);
    if (emailError) errors.email = emailError;
    if (!password) errors.password = 'Enter a temporary password.';
    else if (!isValidPassword(password)) errors.password = PASSWORD_MESSAGE;
    if (!confirmPassword) errors.confirmPassword = 'Repeat the temporary password.';
    else if (!passwordsMatch(password, confirmPassword)) errors.confirmPassword = PASSWORD_MATCH_MESSAGE;
    const phone = String(form.get('phone') ?? '').trim();
    if (phone && !isValidPhilippineMobile(phone)) errors.phone = PHONE_MESSAGE;
    const position = String(form.get('position') ?? '').trim();
    if (position.length > 100) errors.position = 'Keep the position under 100 characters.';
    const bio = String(form.get('bio') ?? '').trim();
    if (bio.length > 1000) errors.bio = 'Keep the bio under 1000 characters.';
    return errors;
  }

  /** Re-check one field, once the reader has left it. */
  function recheckField(field: string, form: HTMLFormElement | null) {
    if (!form) return;
    if (!Object.prototype.hasOwnProperty.call(fieldErrors, field)) return;
    const errors = collectFieldErrors(new FormData(form));
    setFieldErrors((current) => {
      const next = { ...current };
      if (errors[field]) next[field] = errors[field];
      else delete next[field];
      return next;
    });
  }

  /** Show the message for the first field that is not acceptable. */
  function focusFirstError(errors: Record<string, string>) {
    const order = ['firstName', 'lastName', 'email', 'password', 'confirmPassword', 'phone', 'position', 'bio'];
    for (const field of order) {
      if (!errors[field]) continue;
      dialogRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
      return;
    }
  }

  function generatePassword() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%^&*';
    const all = upper + lower + digits + special;
    const chars = [
      upper[Math.floor(Math.random() * upper.length)],
      lower[Math.floor(Math.random() * lower.length)],
      digits[Math.floor(Math.random() * digits.length)],
      special[Math.floor(Math.random() * special.length)],
    ];
    for (let i = 0; i < 8; i++) {
      chars.push(all[Math.floor(Math.random() * all.length)]);
    }
    const shuffled = chars.sort(() => Math.random() - 0.5).join('');
    setPassword(shuffled);
    setConfirmPassword(shuffled);
  }

  function copyPassword() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function validateSchedule(): boolean {
    for (const day of schedule) {
      if (day.enabled) {
        if (!day.startTime || !day.endTime || !isValidTimeRange(day.startTime, day.endTime)) {
          setScheduleError(`${weekDayLabels[day.dayOfWeek - 1]}: Set valid start and end times (start must be before end).`);
          return false;
        }
      }
    }
    setScheduleError('');
    return true;
  }

  function updateScheduleDay(dayOfWeek: number, field: 'enabled' | 'startTime' | 'endTime', value: boolean | string) {
    setSchedule((current) => current.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, [field]: value } : day));
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const errors = collectFieldErrors(form);
    setFieldErrors(errors);
    // Showing a profile on the team page needs at least one specialty, so the
    // page never lists someone with nothing they are known for.
    const specialtyMessage = showOnTeam && specialties.length === 0
      ? 'Select at least one specialty when the profile is shown on the team page.'
      : '';
    setSpecialtyError(specialtyMessage);
    if (Object.keys(errors).length > 0 || specialtyMessage) {
      // The form stays open and keeps what was typed, so the reader can
      // put right the one field that is wrong.
      focusFirstError(errors);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setResult({ success: false, title: 'Account not created', message: 'Sign in as an administrator before creating accounts.' });
      return;
    }
    if (!validatePasswordStrength(password)) {
      setResult({ success: false, title: 'Account not created', message: 'Use a strong temporary password with at least 8 characters, including upper/lowercase, a number, and a special character.' });
      return;
    }
    if (password !== confirmPassword) {
      setResult({ success: false, title: 'Account not created', message: 'The temporary password and confirmation do not match.' });
      return;
    }
    if (!validateSchedule()) return;
    setSubmitting(true);
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const firstName = String(form.get('firstName') ?? '').trim();
    const lastName = String(form.get('lastName') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const position = String(form.get('position') ?? '').trim();
    const bio = String(form.get('bio') ?? '').trim();
    try {
      const response = await apiFetch(`${baseUrl}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({
          email: String(form.get('email') ?? '').trim(),
          password,
          // The API refuses the ADMIN role, and this form never offers it.
          role: selectedRole === 'Manager' ? 'MANAGER' : 'STAFF',
          firstName,
          lastName,
          phone: phone || undefined,
          position: position || undefined,
          bio: bio || undefined,
          coveredRoles,
          showOnTeam,
          specialties,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? 'The account could not be created.');
      const account = payload?.data?.account ?? {};
      const staffId = payload?.data?.staff?.id ? String(payload.data.staff.id) : '';
      let caveats = '';

      // The photo belongs to the staff profile, so it is uploaded only once
      // the account has been created and its staff row exists.
      if (photoRef.current?.hasPendingFile()) {
        if (!staffId) {
          caveats = ' The photo was not uploaded because this account has no staff profile.';
        } else {
          try {
            await photoRef.current.upload(`${baseUrl}/staff/${staffId}/photo`);
          } catch (cause) {
            caveats = ` The account was created, but the photo was not uploaded: ${cause instanceof Error ? cause.message : 'the upload failed.'}`;
          }
        }
      }

      // The weekly schedule is set the same way the staff editor sets it.
      if (staffId && schedule.some((day) => day.enabled)) {
        try {
          await apiFetch(`${baseUrl}/schedules/staff/${staffId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeader(token) },
            body: JSON.stringify({
              schedule: schedule
                .filter((day) => day.enabled)
                .map((day) => ({ dayOfWeek: day.dayOfWeek, startTime: day.startTime, endTime: day.endTime, isActive: true })),
            }),
          });
        } catch {
          // A schedule that could not be saved is set in the staff editor.
          caveats += ' The weekly schedule could not be saved; set it in the staff editor.';
        }
      }

      const credentials: StaffCredentials = {
        accountId: String(account.id ?? ''),
        email: String(account.email ?? form.get('email') ?? ''),
        name: `${firstName} ${lastName}`.trim(),
        password,
      };
      setSubmitting(false);
      if (caveats) {
        setResult({ success: true, title: 'Account created', message: `${credentials.name} can now sign in.${caveats}` });
      }
      setCreatedCredentials(credentials);
    } catch (cause) {
      setResult({ success: false, title: 'Account not created', message: cause instanceof Error ? cause.message : 'The account could not be created.' });
      setSubmitting(false);
    }
  }

  if (result) {
    return <ResultModal success={result.success} title={result.title} message={result.message} onClose={() => {
      if (result.success && !createdCredentials) window.location.reload();
      else setResult(null);
    }} />;
  }

  if (createdCredentials) {
    return (
      <StaffCredentialsPanel
        credentials={createdCredentials}
        onClose={() => { setCreatedCredentials(null); window.location.reload(); }}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="account-creation-title">
      <form ref={dialogRef} className="modal-card account-creation-modal" onSubmit={createAccount} onClick={(event) => event.stopPropagation()} noValidate>
        <div className="modal-header">
          <h3 id="account-creation-title">Create Staff / Manager Account</h3>
          <button type="button" className="close-button" aria-label="Close account modal" onClick={onClose}>×</button>
        </div>
        <div className="modal-subtitle">Enter the account details, choose a role, and set the profile and weekly schedule.</div>

        <div className="form-section">
          <h4 className="form-section-title">Account details</h4>
          <div className="form-grid">
            <label className="field-label" htmlFor="account-first-name">FIRST NAME
              <input id="account-first-name" name="firstName" className="modal-input" required maxLength={100}
                autoComplete="given-name"
                onBlur={(event) => recheckField('firstName', event.currentTarget.form)}
                {...invalidField('account-first-name-error', fieldErrors.firstName)} />
              <FieldError id="account-first-name-error" message={fieldErrors.firstName} />
            </label>
            <label className="field-label" htmlFor="account-last-name">LAST NAME
              <input id="account-last-name" name="lastName" className="modal-input" required maxLength={100}
                autoComplete="family-name"
                onBlur={(event) => recheckField('lastName', event.currentTarget.form)}
                {...invalidField('account-last-name-error', fieldErrors.lastName)} />
              <FieldError id="account-last-name-error" message={fieldErrors.lastName} />
            </label>
          </div>

          <label className="field-label" htmlFor="account-email">EMAIL ADDRESS
            <input id="account-email" name="email" className="modal-input" type="email" required
              autoComplete="email" inputMode="email"
              onBlur={(event) => recheckField('email', event.currentTarget.form)}
              {...invalidField('account-email-error', fieldErrors.email)} />
            <FieldError id="account-email-error" message={fieldErrors.email} />
          </label>
        </div>

        <div className="form-section">
          <h4 className="form-section-title">Profile</h4>
          <ImageUploadField ref={photoRef} label="STAFF PHOTO" idPrefix="account-photo" />
          <div className="form-grid">
            <label className="field-label" htmlFor="account-phone">PHONE
              <input id="account-phone" name="phone" className="modal-input" type="tel" maxLength={30}
                inputMode="tel" autoComplete="tel"
                onBlur={(event) => recheckField('phone', event.currentTarget.form)}
                {...invalidField('account-phone-error', fieldErrors.phone)} />
              <FieldError id="account-phone-error" message={fieldErrors.phone} />
            </label>
            <label className="field-label" htmlFor="account-position">POSITION
              <input id="account-position" name="position" className="modal-input" maxLength={100}
                placeholder="e.g. Senior Stylist"
                onBlur={(event) => recheckField('position', event.currentTarget.form)}
                {...invalidField('account-position-error', fieldErrors.position)} />
              <FieldError id="account-position-error" message={fieldErrors.position} />
            </label>
          </div>
          <label className="field-label" htmlFor="account-bio">BIO
            <textarea id="account-bio" name="bio" className="modal-input" rows={3} maxLength={1000}
              placeholder="A short introduction shown on the team page."
              onBlur={(event) => recheckField('bio', event.currentTarget.form)}
              {...invalidField('account-bio-error', fieldErrors.bio)} />
            <FieldError id="account-bio-error" message={fieldErrors.bio} />
          </label>
          <TagMultiSelect
            label="COVERED ROLES"
            hint="Roles this staff member can step into. Pick from the list or add your own."
            options={COVERED_ROLE_VOCABULARY}
            value={coveredRoles}
            onChange={setCoveredRoles}
          />
          <CheckboxMultiSelect
            label="SPECIALTIES"
            options={categories}
            value={specialties}
            onChange={(next) => { setSpecialties(next); if (next.length > 0) setSpecialtyError(''); }}
            errorId="account-specialties-error"
            errorMessage={specialtyError}
          />
          <ToggleSwitch
            label="Show on team page"
            hint="List this staff member on the public team page."
            checked={showOnTeam}
            onChange={(next) => {
              setShowOnTeam(next);
              if (!next) setSpecialtyError('');
            }}
          />
        </div>

        <div className="form-section">
          <h4 className="form-section-title">Credentials</h4>
          <div className="password-field-grid">
          <div>
          <label className="field-label" htmlFor="account-temp-password">TEMPORARY PASSWORD</label>
          <div className="password-input-group">
            <input id="account-temp-password" className="modal-input" type={showPassword ? 'text' : 'password'} value={password}
              onChange={(event) => { setPassword(event.target.value); setFieldErrors((current) => { const next = { ...current }; delete next.password; return next; }); }}
              onBlur={(event) => recheckField('password', event.currentTarget.form)}
              minLength={8} required autoComplete="new-password"
              {...invalidField('account-temp-password-error', fieldErrors.password)} />
            <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} title={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
              )}
            </button>
          </div>
          </div>
          <div>
          <label className="field-label" htmlFor="account-temp-password-confirm">CONFIRM PASSWORD</label>
          <div className="password-input-group">
            <input id="account-temp-password-confirm" className="modal-input" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword}
              onChange={(event) => { setConfirmPassword(event.target.value); setFieldErrors((current) => { const next = { ...current }; delete next.confirmPassword; return next; }); }}
              onBlur={(event) => recheckField('confirmPassword', event.currentTarget.form)}
              minLength={8} required autoComplete="new-password"
              {...invalidField('account-temp-password-confirm-error', fieldErrors.confirmPassword)} />
          <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} aria-pressed={showConfirmPassword} title={showConfirmPassword ? 'Hide password' : 'Show password'}>
            {showConfirmPassword ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
            )}
          </button>
        </div>
          <FieldError id="account-temp-password-error" message={fieldErrors.password} />
          </div>
          <FieldError id="account-temp-password-confirm-error" message={fieldErrors.confirmPassword} />
          </div>
          <div className="password-helper-row">
            <p className="form-hint">Use at least 8 characters with upper/lowercase, a number, and a special character.</p>
            <div className="password-helper-actions">
              <button type="button" className="password-toggle standalone" onClick={copyPassword} aria-label={copied ? 'Password copied' : 'Copy password'} title="Copy password">
                {copied ? (
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/></svg>
                )}
                <span>Copy</span>
              </button>
              <button type="button" className="generate-password-button" onClick={generatePassword} title="Generate a secure password">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Generate Password
              </button>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4 className="form-section-title">Access and schedule</h4>
          <span className="field-label">ASSIGN ROLE (HIERARCHY)</span>
          <div className="role-grid">
            <button type="button" className={`role-option${selectedRole === 'Manager' ? ' active' : ''}`} onClick={() => setSelectedRole('Manager')} aria-pressed={selectedRole === 'Manager'}>
              <strong>Manager</strong>
              <span>Can manage services &amp; bookings</span>
            </button>
            <button type="button" className={`role-option${selectedRole === 'Staff' ? ' active' : ''}`} onClick={() => setSelectedRole('Staff')} aria-pressed={selectedRole === 'Staff'}>
              <strong>Staff</strong>
              <span>Assigned to service schedules</span>
            </button>
          </div>

          <div className="staff-schedule-section">
          <span className="field-label">STAFF SCHEDULE (WEEKLY)</span>
          <div className="schedule-grid">
            {schedule.map((day) => (
              <div key={day.dayOfWeek} className={`schedule-day${day.enabled ? ' enabled' : ''}`}>
                <label className="schedule-day-header">
                  <input type="checkbox" checked={day.enabled} onChange={(e) => updateScheduleDay(day.dayOfWeek, 'enabled', e.target.checked)} />
                  <span>{weekDayLabels[day.dayOfWeek - 1]}</span>
                </label>
                {day.enabled && (
                  <div className="schedule-day-times">
                    <input type="time" className="modal-input" value={day.startTime} onChange={(e) => updateScheduleDay(day.dayOfWeek, 'startTime', e.target.value)} aria-label={`${weekDayLabels[day.dayOfWeek - 1]} start time`} />
                    <span>–</span>
                    <input type="time" className="modal-input" value={day.endTime} onChange={(e) => updateScheduleDay(day.dayOfWeek, 'endTime', e.target.value)} aria-label={`${weekDayLabels[day.dayOfWeek - 1]} end time`} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {scheduleError && <p className="form-error" role="alert">{scheduleError}</p>}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-action" disabled={submitting}>{submitting ? 'Creating…' : 'Create Account'}</button>
        </div>
      </form>
    </div>
  );
}


function LoginPage({ onLogin }: { onLogin: (role: AccountRole | null) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * Check the sign-in form.
   *
   * The address is checked for shape only. Whether it exists is the
   * server's business, and no domain is required here: the demo accounts
   * and the seeded staff accounts do not all share one domain.
   */
  function collectFieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    const address = email.trim();
    if (!address) errors.email = 'Enter your email address.';
    else if (!isValidEmail(address)) errors.email = EMAIL_MESSAGE;
    if (!password) errors.password = 'Enter your password.';
    return errors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const errors = collectFieldErrors();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const order = ['email', 'password'];
      for (const field of order) {
        if (!errors[field]) continue;
        event.currentTarget.querySelector<HTMLElement>(`#login-${field}`)?.focus();
        break;
      }
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to sign in. Check your credentials and API connection.');
      storeAccessTokens(payload.data.accessToken, payload.data.refreshToken);
      // The role decides which area the session opens. It is read from the
      // sign-in response and used for navigation only; the API remains the
      // authority on what the session may do.
      const session = readLoginSession(payload);
      if (session) storeAccountSession(session);
      onLogin(session?.role ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <main className="login-form-panel">
        <div className="login-pane">
          <div className="login-brand-head">
            <span className="login-monogram" aria-hidden="true"><img src="/images/Logo.jpg" alt="" /></span>
            <div className="login-wordmark-block">
              <p className="login-wordmark">ROYALTY</p>
              <p className="login-brand-studio">Hair &amp; Nails Studio</p>
            </div>
          </div>

          <header className="login-pane-header">
            <p className="login-overline">Studio Access</p>
            <h1 className="login-title">Welcome back.</h1>
            <p className="login-lede">Sign in to manage appointments, services, staff schedules and payments for the studio.</p>
          </header>

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="login-field">
              <label className="login-field-label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                className="login-input"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); setFieldErrors((current) => { const next = { ...current }; delete next.email; return next; }); }}
                autoComplete="username"
                placeholder="you@royalty.studio"
                required
                {...invalidField('login-email-error', fieldErrors.email)}
              />
              <FieldError id="login-email-error" message={fieldErrors.email} />
            </div>
            <div className="login-field">
              <label className="login-field-label" htmlFor="login-password">Password</label>
              <div className="login-password-group">
                <input
                  id="login-password"
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); setFieldErrors((current) => { const next = { ...current }; delete next.password; return next; }); }}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  {...invalidField('login-password-error', fieldErrors.password)}
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                  )}
                </button>
              </div>
              <FieldError id="login-password-error" message={fieldErrors.password} />
            </div>
            {error && (
              <p className="login-error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"/><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                {error}
                <span className="sr-only">Sign-in error.</span>
              </p>
            )}
            <button type="submit" className="login-submit" disabled={submitting}
              aria-busy={submitting}>
              <span className="submit-text">{submitting ? 'Signing in…' : 'Sign In'}</span>
              <span className="submit-spinner" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="31.4 31.4"/></svg>
              </span>
            </button>
          </form>
          <footer className="login-footer">
            <p>Royalty Hair &amp; Nails Studio</p>
          </footer>
        </div>
      </main>

      <BrandShowcase />
    </div>
  );
}

export default App;
