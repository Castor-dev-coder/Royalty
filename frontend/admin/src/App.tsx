import { BrowserRouter, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, clearAccessTokens, getAccessToken, mockApiEnabled, resetMockData, storeAccessTokens } from './api';

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

const navItems = [
  { label: 'Business Dashboard', to: '/' },
  { label: 'Account Management', to: '/accounts' },
  { label: 'Appointments & Calendar', to: '/appointments' },
  { label: 'Payments & Verification', to: '/payments' },
  { label: 'Staff Management', to: '/staff' },
];

const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const APPOINTMENT_STATUS_TEXT: Record<string, string> = {
  RESERVED: 'Reserved',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No show',
};

function appointmentStatusText(status: string): string {
  return APPOINTMENT_STATUS_TEXT[status] ?? String(status).replace('_', ' ').toLowerCase();
}

function appointmentStatusBadge(status: string): string {
  if (status === 'COMPLETED') return 'success';
  if (status === 'CONFIRMED') return 'warning';
  if (status === 'RESERVED') return 'neutral';
  return 'muted';
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<BusinessDashboardPage />} />
          <Route path="services" element={<ServiceManagementPage />} />
          <Route path="accounts" element={<AccountManagementPage />} />
          <Route path="staff" element={<StaffManagementPage />} />
            <Route path="appointments" element={<AppointmentPage />} />
          <Route path="payments" element={<PaymentPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
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

function useAccountData() {
  const [data, setData] = useState<TableRow[]>([]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token && !mockApiEnabled) return;

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
      })
      .catch(() => {
        if (!controller.signal.aborted) setData([]);
      });

    return () => controller.abort();
  }, []);

  return [data, setData] as const;
}

function useStaffData() {
  const [data, setData] = useState<StaffRow[]>([]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token && !mockApiEnabled) return;
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
          schedule: (schedules.get(staff.id) ?? []).filter((schedule) => schedule.isActive).sort((left, right) => left.dayOfWeek - right.dayOfWeek).map((schedule) => {
            const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][schedule.dayOfWeek - 1] ?? '';
            const formatTime = (time: string) => {
              const [hour, minute] = time.split(':').map(Number);
              return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour >= 12 ? 'PM' : 'AM'}`;
            };
            return `${day || (schedule.dayOfWeek === 0 ? 'Sun' : '')}, ${formatTime(schedule.startTime)}-${formatTime(schedule.endTime)}`;
          }).join(' · ') || 'No schedule assigned',
          status: staff.workStatus === 'ON_DUTY' ? 'Active' : staff.workStatus === 'UNAVAILABLE' ? 'On Vacation' : 'Day Off',
        })));
      })
      .catch(() => {
        if (!controller.signal.aborted) setData([]);
      });

    return () => controller.abort();
  }, []);

  return [data, setData] as const;
}

function useAppointmentData() {
  const [data, setData] = useState<AppointmentRow[]>([]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token && !mockApiEnabled) return;
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
      });

    return () => controller.abort();
  }, []);

  return [data, setData] as const;
}

function Shell() {
  const location = useLocation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getAccessToken()));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const pageTitle = useMemo(() => {
    if (location.pathname === '/accounts') return 'Authentication & Account Management';
    if (location.pathname === '/staff') return 'Staff Directory & Performance';
    if (/^\/staff\/[^/]+\/edit$/.test(location.pathname)) return 'Edit Staff Account';
    if (location.pathname === '/appointments') return 'Appointment Management';
    if (location.pathname === '/payments') return 'Payments & Verification';
    if (location.pathname === '/services') return 'Service Management';
    return 'Business Dashboard';
  }, [location.pathname]);

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => { setIsAuthenticated(true); window.location.reload(); }} />;
  }

  return (
    <div className="page-bg">
      <div className="viewer-shell">
        <button type="button" className="mobile-nav-toggle" aria-label="Toggle navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>
          <span />
          <span />
          <span />
        </button>

        <aside className={`sidebar${mobileNavOpen ? ' mobile-open' : ''}`}>
          <div className="brand-wrap sidebar-brand">
            <div className="brand-mark">R</div>
            <div>
              <h1>ROYALTY SALON</h1>
              <p>ADMIN PANEL</p>
            </div>
          </div>
          <nav className="nav" aria-label="Main navigation">
            {navItems.map(({ label, to }) => (
              <NavLink key={label} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={() => setMobileNavOpen(false)}>
                <span className="nav-icon" aria-hidden="true">{label === 'Business Dashboard' ? '▣' : label === 'Account Management' ? '◫' : label === 'Appointments & Calendar' ? '▤' : label === 'Payments & Verification' ? '≡' : '◎'}</span>
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="profile-card sidebar-profile"
            onClick={() => {
              clearAccessTokens();
              setIsAuthenticated(false);
              window.location.reload();
            }}
          >
            <div className="avatar">SA</div>
            <div>
              <strong>{mockApiEnabled ? 'Demo Administrator' : 'Signed in'}</strong>
              <span>Sign out</span>
            </div>
          </button>
        </aside>

        <main className="content-panel">
          <section className="page-header">
            <div>
              <h2>{pageTitle}</h2>
              <p>
                {location.pathname === '/accounts'
                  ? 'Manage role-based access, create staff accounts, and view audit activity.'
                  : location.pathname === '/staff'
                    ? 'View all professional staff, metrics, and current schedules.'
                    : location.pathname === '/appointments'
                      ? 'Track appointments, slot availability, and customer confirmations.'
                      : location.pathname === '/payments'
                        ? 'Review transaction activity, verify payments, and manage submissions.'
                        : location.pathname === '/services'
                          ? 'Manage service categories, pricing, and availability.'
                        : 'Overview of bookings, revenue, and customer insights.'}
              </p>
            </div>
            {location.pathname === '/accounts' ? (
              <button type="button" className="primary-button" onClick={() => setShowCreateModal(true)}>+ Create New Account</button>
            ) : null}
          </section>

          {mockApiEnabled && (
            <div className="demo-data-banner">
              <span><strong>Development demo</strong> · Fictional records saved in this browser</span>
              <button type="button" onClick={resetMockData}>Reset demo data</button>
            </div>
          )}

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

      {showCreateModal && <AccountCreationModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}

function BusinessDashboardPage() {
  const reviewData = useReviewData();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [appointmentsAvailable, setAppointmentsAvailable] = useState(false);
  const [paymentsAvailable, setPaymentsAvailable] = useState(false);
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long' }).toUpperCase();

  useEffect(() => {
    const token = getAccessToken();
    if (!token && !mockApiEnabled) return;
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
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const startOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const monthAppointments = appointments.filter((item) => item.appointmentDate >= startOfMonth && item.appointmentDate.slice(0, 7) === todayKey.slice(0, 7));
  const verifiedPayments = payments.filter((payment) => payment.status === 'VERIFIED');
  const averageRating = reviewData.length ? (reviewData.reduce((total, review) => total + review.rating, 0) / reviewData.length).toFixed(1) : '—';
  const dashboardMetrics = [
    { label: "TODAY'S BOOKINGS", value: appointmentsAvailable ? appointments.filter((item) => item.appointmentDate === todayKey).length : '—', suffix: 'TODAY' },
    { label: 'TOTAL BOOKINGS', value: appointmentsAvailable ? monthAppointments.length : '—', suffix: monthLabel },
    { label: 'COMPLETED', value: appointmentsAvailable ? monthAppointments.filter((item) => item.status === 'COMPLETED').length : '—', suffix: monthLabel },
    { label: 'CANCELLED', value: appointmentsAvailable ? monthAppointments.filter((item) => item.status === 'CANCELLED').length : '—', suffix: monthLabel },
    { label: 'REVENUE', value: paymentsAvailable ? `₱${verifiedPayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0).toLocaleString()}` : '—', suffix: paymentsAvailable ? 'VERIFIED' : 'NOT CONNECTED' },
    { label: 'AVG RATINGS', value: averageRating, suffix: 'RECENT REVIEWS' },
  ];
  const bookingTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      value: appointments.filter((item) => item.appointmentDate === key).length,
    };
  });
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
  const monthRevenue = verifiedPayments
    .filter((payment) => String(payment.createdAt).slice(0, 7) === todayKey.slice(0, 7))
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

  return (
    <>
      <div className="stats-grid six-col">
        {dashboardMetrics.map((metric) => (
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
            <h3>Booking Trends</h3>
            <span>Last 7 days</span>
          </div>
          <div className="chart-bars" aria-label="Booking trend chart">
            {bookingTrend.map(({ label, value }) => (
              <div key={label} className="bar-group">
                <div className="bar" style={{ height: `${value ? Math.max(18, (value / Math.max(1, ...bookingTrend.map((item) => item.value))) * 100) : 8}%` }} title={`${value} bookings`} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel summary-panel">
          <div className="panel-header compact">
            <h3>Payment Summary</h3>
            <span>Month</span>
          </div>
          <ul className="summary-list">
            <li><span>Total Verified</span><strong>{paymentsAvailable ? `₱${verifiedPayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0).toLocaleString()}` : '—'}</strong></li>
            <li><span>This Month</span><strong>{paymentsAvailable ? `₱${monthRevenue.toLocaleString()}` : '—'}</strong></li>
            <li><span>Pending Payment</span><strong>{paymentsAvailable ? pendingPayments.length : '—'}</strong></li>
            <li><span>Needs verification</span><strong>{paymentsAvailable ? `₱${pendingPayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0).toLocaleString()}` : '—'}</strong></li>
          </ul>
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
            <h3>Customer Reviews & Ratings</h3>
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
    if (!token && !mockApiEnabled) {
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

  async function saveService(values: { categoryId: string; name: string; description: string; price: number; durationMinutes: number }, service: ServiceRecord | null) {
    if (!token) throw new Error('Sign in with an administrator account to manage services.');
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const response = await apiFetch(service ? `${baseUrl}/services/${service.id}` : `${baseUrl}/services`, {
      method: service ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message ?? 'Unable to save the service.');
    await loadCatalog();
    setEditing(null);
    setOutcome({ success: true, title: service ? 'Service updated' : 'Service added', message: `${values.name} has been saved to the service catalog.` });
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
      {loading && <p className="empty-list">Loading service catalog…</p>}
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!loading && !loadError && (
        <div className="service-table-scroll">
          <table>
            <thead><tr><th>Service</th><th>Category</th><th>Duration</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleServices.map((service) => (
                <tr key={service.id}>
                  <td><strong>{service.name}</strong>{service.description && <small className="service-description">{service.description}</small>}</td>
                  <td>{service.categoryName}</td>
                  <td>{service.durationMinutes} min</td>
                  <td>₱{Number(service.price).toLocaleString()}</td>
                  <td><span className={`status-badge ${service.isActive ? 'success' : 'muted'}`}>{service.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td><div className="service-actions">
                    <button type="button" className="link-button" onClick={() => setEditing(service)}>Edit</button>
                    <button type="button" className="link-button" onClick={() => setAction({ type: 'suspend', service })}>{service.isActive ? 'Suspend' : 'Activate'}</button>
                    <button type="button" className="link-button danger-link" disabled={!service.isActive} onClick={() => setAction({ type: 'delete', service })}>Archive</button>
                  </div></td>
                </tr>
              ))}
              {visibleServices.length === 0 && <tr><td colSpan={6}>{services.length ? 'No services match these filters.' : 'No services in the catalog yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && <ServiceEditorModal service={editing === 'new' ? null : editing} categories={categories.filter((category) => category.isActive)} onClose={() => setEditing(null)} onSave={saveService} />}
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

function ServiceEditorModal({ service, categories, onClose, onSave }: {
  service: ServiceRecord | null;
  categories: CategoryRecord[];
  onClose: () => void;
  onSave: (values: { categoryId: string; name: string; description: string; price: number; durationMinutes: number; imageUrl?: string | null }, service: ServiceRecord | null) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imagePreview, setImagePreview] = useState(service?.imageUrl ?? '');
  const [fileHint, setFileHint] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        categoryId: String(form.get('categoryId')),
        name: String(form.get('name')).trim(),
        description: String(form.get('description')).trim(),
        price: Number(form.get('price')),
        durationMinutes: Number(form.get('durationMinutes')),
        imageUrl: imagePreview || null,
      }, service);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the service.');
      setBusy(false);
    }
  }

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
  const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

  function isValidImageFile(file: File): boolean {
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) return true;
    const name = file.name.toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
  }

  function setImageFromFile(file: File | null) {
    if (!file) return;
    if (!isValidImageFile(file)) {
      setFileHint('Unsupported file type. Please upload a JPEG or PNG image (.jpg, .jpeg, .png).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileHint('Image is too large. Please use a file under 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = String(reader.result ?? '');
      setImagePreview(imageUrl);
      setFileHint('');
    };
    reader.readAsDataURL(file);
  }

  function handleImageFile(event: React.ChangeEvent<HTMLInputElement>) {
    setImageFromFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    setImageFromFile(file);
  }

  function removeImage() {
    setImagePreview('');
    setFileHint('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="service-editor-title" onClick={onClose}>
      <form className="modal-card service-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><h3 id="service-editor-title">{service ? 'Edit Service' : 'Add Service'}</h3><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>

        <div className="service-upload-field">
          <span className="field-label">SERVICE PHOTO</span>
          <div
            className={`service-upload-dropzone${imagePreview ? ' filled' : ''}${dragActive ? ' drag-active' : ''}`}
            onClick={() => imageInputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            aria-label="Upload service photo"
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); imageInputRef.current?.click(); } }}
          >
            <input ref={imageInputRef} className="service-upload-input" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={handleImageFile} />
            {imagePreview ? (
              <img src={imagePreview} alt="Service preview" className="service-image-preview" />
            ) : (
              <div className="service-upload-placeholder">
                <span className="upload-icon" aria-hidden="true">⇪</span>
                <span>Drag and drop a service photo here or click to browse</span>
              </div>
            )}
            {fileHint && <p className="file-hint-warning" role="alert">{fileHint}</p>}
          </div>
          {imagePreview && (
            <div className="service-upload-actions">
              <button type="button" className="secondary-action" onClick={() => imageInputRef.current?.click()}>Replace Photo</button>
              <button type="button" className="link-button danger-link" onClick={removeImage}>Remove Photo</button>
            </div>
          )}
        </div>

        <label className="field-label">SERVICE NAME<input className="modal-input" name="name" defaultValue={service?.name ?? ''} required maxLength={200} /></label>
        <label className="field-label">CATEGORY<select className="modal-input" name="categoryId" defaultValue={service?.categoryId ?? categories[0]?.id ?? ''} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field-label">DESCRIPTION<textarea className="modal-input" name="description" defaultValue={service?.description ?? ''} maxLength={500} rows={3} /></label>
        <div className="form-grid">
          <label className="field-label">PRICE (PHP)<input className="modal-input" name="price" type="number" min="0.01" step="0.01" defaultValue={service?.price ?? ''} required /></label>
          <label className="field-label">DURATION (MINUTES)<input className="modal-input" name="durationMinutes" type="number" min="1" max="300" step="1" defaultValue={service?.durationMinutes ?? ''} required /></label>
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
  const [busy, setBusy] = useState(false);
  async function saveCategory(id?: string) {
    const name = (id ? editingName : newName).trim();
    if (!name) { setError('Enter a category name.'); return; }
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
      <section className="modal-card service-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><h3 id="category-manager-title">Manage Categories</h3><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="category-create-row"><input className="modal-input" aria-label="New category name" placeholder="New category name" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} /><button type="button" className="primary-action" disabled={busy} onClick={() => void saveCategory()}>Add</button></div>
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
      <section className="modal-card confirm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><h3 id="confirm-action-title">{title}</h3><button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button></div>
        <p>{message}</p>
        <div className="modal-actions"><button type="button" className="secondary-action" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className={danger ? 'reject-action' : 'primary-action'} disabled={busy} onClick={() => void confirm()}>{busy ? 'Saving…' : confirmLabel}</button></div>
      </section>
    </div>
  );
}

function ResultModal({ success, title, message, onClose }: { success: boolean; title: string; message: string; onClose: () => void }) {
  return (
    <div className="modal-overlay result-layer" role="dialog" aria-modal="true" aria-labelledby="result-modal-title">
      <section className="modal-card result-modal">
        <div className={`result-icon ${success ? 'success' : 'failure'}`} aria-hidden="true">{success ? '✓' : '!'}</div>
        <h3 id="result-modal-title">{title}</h3>
        <p>{message}</p>
        <div className="modal-actions"><button type="button" className="primary-action" onClick={onClose}>Continue</button></div>
      </section>
    </div>
  );
}

function AccountManagementPage() {
  const [rows, setRows] = useAccountData();
  const [search, setSearch] = useState('');
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
            <input aria-label="Search accounts" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email or role..." className="search-input" />
          </div>
          <table>
            <thead>
              <tr>
                <th>User / Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login / Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.email}>
                  <td>
                    <div className="user-cell">
                      <span className="user-avatar">{row.id}</span>
                      <div>
                        <strong>{row.user}</strong>
                        <small>{row.email}</small>
                      </div>
                    </div>
                  </td>
                  <td><span className="role-badge">{row.role}</span></td>
                  <td>
                    <span className={`status-badge ${row.status === 'Active' ? 'success' : row.status === 'Deactivated' ? 'muted' : 'warning'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>{row.lastLogin}</td>
                  <td><button type="button" className="link-button" disabled={!row.accountId} onClick={() => setPendingAction({ row, nextStatus: row.status === 'Active' ? 'DEACTIVATED' : 'ACTIVE' })}>{row.status === 'Active' ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              ))}
              {visibleRows.length === 0 && <tr><td colSpan={5}>{rows.length ? 'No accounts match this search.' : 'No account records are available for this session.'}</td></tr>}
            </tbody>
          </table>
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
    </>
  );
}

function StaffManagementPage() {
  const [rows, setRows] = useStaffData();
  const [scheduleRequestCount, setScheduleRequestCount] = useState(0);
  const [search, setSearch] = useState('');
  const [editingStaff, setEditingStaff] = useState<StaffRow | null>(null);
  const visibleRows = rows.filter((row) => `${row.user} ${row.email} ${row.role}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const token = getAccessToken();
    if (!token && !mockApiEnabled) return;
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const controller = new AbortController();
    apiFetch(`${baseUrl}/schedules/requests`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const payload = await response.json();
        if (response.ok) setScheduleRequestCount((payload?.data?.scheduleRequests ?? []).length);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

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

      <section className="panel table-panel large-table">
        <div className="panel-header compact">
          <h3>Royal Salon Professional Staff Directory</h3>
          <div className="table-tools">
            <input aria-label="Search staff" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email or role..." className="search-input" />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>User / Email</th>
              <th>Primary Role</th>
              <th>Employment Type</th>
              <th>Current Schedule</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.email}>
                <td>
                  <div className="user-cell">
                    <span className="user-avatar">{row.user.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>{row.user}</strong>
                      <small>{row.email}</small>
                    </div>
                  </div>
                </td>
                <td>{row.role}</td>
                <td>{row.employment}</td>
                <td>{row.schedule}</td>
                <td>
                  <span className={`status-badge ${row.status === 'Active' ? 'success' : 'warning'}`}>
                    {row.status}
                  </span>
                </td>
                <td><button type="button" className="link-button" disabled={!row.id} onClick={() => row.id && setEditingStaff(row)}>Edit Staff Account</button></td>
              </tr>
            ))}
            {visibleRows.length === 0 && <tr><td colSpan={6}>No staff records match this view.</td></tr>}
          </tbody>
        </table>
      </section>

      {editingStaff && (
        <StaffEditModal
          staff={editingStaff}
          onClose={() => setEditingStaff(null)}
          onSaved={() => { setEditingStaff(null); window.location.reload(); }}
        />
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
  const [loadingTimeOff, setLoadingTimeOff] = useState(mockApiEnabled);
  const [schedule, setSchedule] = useState(normalizeWeeklySchedule());
  const [scheduleError, setScheduleError] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    if (!mockApiEnabled) {
      setTimeOffUnavailable(true);
      setLoadingTimeOff(false);
      return;
    }
    const controller = new AbortController();
    apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/staff/${staff.id}/time-off`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? 'Unable to load time-off records.');
        setTimeOff(payload?.data?.timeOff ?? []);
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load time-off records.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingTimeOff(false); });
    return () => controller.abort();
  }, [staff.id]);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) { setError('Sign in with an administrator account to edit staff.'); return; }
    setSubmitting(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const lastName = String(form.get('lastName') ?? '').trim();
    try {
      const response = await apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lastName,
          phone: String(form.get('phone') ?? ''),
          primaryRole: String(form.get('primaryRole') ?? '').trim(),
          employmentType: String(form.get('employmentType')),
          workStatus: String(form.get('workStatus')),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to save staff changes.');
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
      if (day.enabled && (!day.startTime || !day.endTime || day.startTime >= day.endTime)) {
        setScheduleError(`${weekDayLabels[day.dayOfWeek - 1]}: Set valid start and end times.`);
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
      <section className="modal-card staff-edit-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 id="staff-edit-title">Edit Staff Account</h3>
          <button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="staff-edit-content">
          <form className="staff-account-form" onSubmit={handleSubmit}>
            <h4>Staff Account Information</h4>
            <p className="form-hint">{staff.email}</p>
            <div className="form-grid">
              <label className="field-label">FIRST NAME<input className="modal-input" name="firstName" value={staff.firstName ?? ''} readOnly disabled aria-label="First name (read only)" /></label>
              <label className="field-label">LAST NAME<input className="modal-input" name="lastName" defaultValue={staff.lastName ?? ''} required maxLength={100} /></label>
            </div>
            <label className="field-label">PHONE<input className="modal-input" name="phone" type="tel" defaultValue={staff.phone ?? ''} maxLength={30} /></label>
            <label className="field-label">PRIMARY ROLE<input className="modal-input" name="primaryRole" defaultValue={staff.role} required maxLength={100} /></label>
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

          <div className="panel scheduling-rules-panel">
            <div className="panel-header"><h4>Scheduling Rules</h4></div>
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
              <button type="button" className="secondary-action" onClick={saveSchedule} disabled={savingSchedule}>{savingSchedule ? 'Saving…' : 'Save Schedule'}</button>
            </div>
          </div>

          <div className="panel time-off-panel">
            <div className="panel-header"><div><h4>Vacation &amp; Day Off</h4><p>Set date-based availability for this staff account.</p></div><button type="button" className="primary-button" disabled={timeOffUnavailable} onClick={() => { setEditingTimeOff(null); setShowTimeOff(true); }}>+ Add Vacation / Day Off</button></div>
            {timeOffUnavailable && <p className="form-hint">Date-specific time off is not supported by the configured backend. The development demo stores these entries locally.</p>}
            {loadingTimeOff && <p className="empty-list">Loading time-off entries…</p>}
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
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startDate = String(form.get('startDate') ?? '');
    const endDate = String(form.get('endDate') ?? '');
    const startTime = String(form.get('startTime') ?? '') || null;
    const endTime = String(form.get('endTime') ?? '') || null;
    if (startDate > endDate) { setError('The end date must be on or after the start date.'); return; }
    if ((startTime === null) !== (endTime === null)) { setError('Enter both start and end times, or leave both blank for all day.'); return; }
    if (startTime && endTime && startTime >= endTime) { setError('The end time must be later than the start time.'); return; }
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
      <form className="modal-card service-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
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
  const [appointments, setAppointments] = useAppointmentData();
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRow | null>(null);
  const [confirmation, setConfirmation] = useState<{ appointment: AppointmentRow; status: string } | null>(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [message, setMessage] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState<'all' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'>('all');
  const token = getAccessToken();
  const navigate = useNavigate();
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
  const monthBreakdown = monthStatusSequence
    .filter((status) => (monthStatusCounts.get(status) ?? 0) > 0)
    .map((status) => `${monthStatusCounts.get(status)} ${appointmentStatusText(status).toLowerCase()}`);
  const selectedAppointments = appointments
    .filter((item) => item.appointmentDate === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const allAppointments = [...appointments].sort((a, b) => {
    const dateCompare = a.appointmentDate.localeCompare(b.appointmentDate);
    return dateCompare !== 0 ? dateCompare : a.startTime.localeCompare(b.startTime);
  });
  const sidebarAppointments = allAppointments.filter((appt) => {
    if (sidebarFilter === 'all') return true;
    return appt.status === sidebarFilter;
  });
  const filterCounts = {
    all: allAppointments.length,
    CONFIRMED: allAppointments.filter((a) => a.status === 'CONFIRMED').length,
    CANCELLED: allAppointments.filter((a) => a.status === 'CANCELLED').length,
    COMPLETED: allAppointments.filter((a) => a.status === 'COMPLETED').length,
  };

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
        <div className="sidebar-filters">
          <button className={sidebarFilter === 'all' ? 'active' : ''} onClick={() => setSidebarFilter('all')}>All ({filterCounts.all})</button>
          <button className={sidebarFilter === 'CONFIRMED' ? 'active' : ''} onClick={() => setSidebarFilter('CONFIRMED')}>Confirmed ({filterCounts.CONFIRMED})</button>
          <button className={sidebarFilter === 'CANCELLED' ? 'active' : ''} onClick={() => setSidebarFilter('CANCELLED')}>Cancelled ({filterCounts.CANCELLED})</button>
          <button className={sidebarFilter === 'COMPLETED' ? 'active' : ''} onClick={() => setSidebarFilter('COMPLETED')}>Completed ({filterCounts.COMPLETED})</button>
        </div>
        <div className="sidebar-appointment-list">
          {sidebarAppointments.map((appt) => (
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
          {sidebarAppointments.length === 0 && <p className="empty-list">No appointments match this filter.</p>}
        </div>
      </aside>
      <section className="panel calendar-panel">
        <div className="calendar-header-row">
          <button type="button" className="tiny-button" aria-label="Previous month" onClick={() => moveCalendarMonth(-1)}>‹</button>
          <strong>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" className="tiny-button" aria-label="Next month" onClick={() => moveCalendarMonth(1)}>›</button>
        </div>
        <p className="calendar-month-summary" aria-live="polite">
          <strong>{monthAppointments.length === 0
            ? 'No appointments this month'
            : `${monthAppointments.length} ${monthAppointments.length === 1 ? 'appointment' : 'appointments'} this month`}</strong>
          {monthBreakdown.length > 0 && <span className="calendar-summary-breakdown">{monthBreakdown.join(' · ')}</span>}
        </p>
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
        <section className="selected-day-panel">
          <div className="panel-header compact"><h3>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</h3><span>{selectedAppointments.length} {selectedAppointments.length === 1 ? 'appointment' : 'appointments'}</span></div>
          {selectedAppointments.map((appointment) => (
            <button type="button" key={appointment.code} className="selected-appointment" onClick={() => setSelectedAppointment(appointment)}>
              <span>
                <strong>{appointment.customerName || 'Customer'} · {appointment.staffName || 'Staff'}</strong>
                <small>{appointment.serviceNames} · {appointment.startTime}–{appointment.endTime} · {appointment.code}</small>
                <small className="past-review-tag-wrap">{isPastNonterminal(appointment, todayKey) && <span className="past-review-tag">Past — needs review</span>}</small>
              </span>
              <span className={`status-badge ${appointmentStatusBadge(appointment.status)}`}>{appointmentStatusText(appointment.status)}</span>
            </button>
          ))}
          {selectedAppointments.length === 0 && <p className="empty-list">No appointments scheduled for this date.</p>}
          {message && <p className="table-message" role="status">{message}</p>}
        </section>
      </section>
      {selectedAppointment && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title" onClick={() => setSelectedAppointment(null)}>
          <section className="modal-card appointment-detail-modal" onClick={(event) => event.stopPropagation()}>
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
    if (!token && !mockApiEnabled) return;
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
          <div className="payment-stat"><span className="status-badge muted">Review</span><strong>{payments.filter((payment) => payment.status === 'REJECTED').length}</strong><small>Rejected</small></div>
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
          {!mockApiEnabled && payments.length === 0 ? (
            <div className="payment-unavailable">
              <strong>Payments API unavailable</strong>
              <p>{notice || 'The configured backend does not expose payment records. No demo payments are mixed into live data.'}</p>
            </div>
          ) : (
            <div className="payment-table-scroll">
              <table>
                <thead><tr><th>Reference / Customer</th><th>Service</th><th>Amount</th><th>Booking</th><th>Payment</th><th>Action</th></tr></thead>
                <tbody>
                  {displayedPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td><div className="payment-customer"><strong>{payment.customerName}</strong><small>{payment.appointmentCode} · {payment.customerEmail}</small></div></td>
                      <td>{payment.serviceName}</td>
                      <td><strong>₱{Number(payment.amount).toLocaleString()}</strong><small className="payment-method">{payment.paymentMethod}</small></td>
                      <td><span className={`status-badge ${appointmentStatusBadge(String(payment.bookingStatus ?? 'RESERVED'))}`}>{appointmentStatusText(String(payment.bookingStatus ?? 'RESERVED'))}</span></td>
                      <td><span className={`status-badge ${payment.status === 'VERIFIED' ? 'success' : payment.status === 'REJECTED' ? 'muted' : 'warning'}`}>{payment.status === 'VERIFIED' ? 'Verified' : payment.status === 'REJECTED' ? 'Rejected' : 'Pending'}</span></td>
                      <td>{payment.status === 'UNVERIFIED'
                        ? <button type="button" className="payment-action" disabled={!token || !mockApiEnabled} onClick={() => { setSelectedPayment(payment); setVerificationCode(''); setCodeError(''); }}>Verify</button>
                        : <span className="payment-date">{payment.verifiedAt ? new Date(payment.verifiedAt).toLocaleDateString() : '—'}</span>}</td>
                    </tr>
                  ))}
                  {displayedPayments.length === 0 && <tr><td colSpan={6}>{payments.length ? 'No payments match this view.' : 'No payment records are available.'}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {!token && mockApiEnabled && <p className="payment-hint">Sign in with the demo administrator to verify payments.</p>}
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
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="verify-payment-title" onClick={() => setSelectedPayment(null)}>
          <section className="modal-card payment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><h3 id="verify-payment-title">Verify payment</h3><button type="button" className="close-button" aria-label="Close payment verification" onClick={() => setSelectedPayment(null)}>×</button></div>
            <p className="form-hint">Enter the five-digit payment code supplied for this appointment. This development verification does not process a real payment.</p>
            <dl className="payment-details">
              <div><dt>Reference</dt><dd>{selectedPayment.appointmentCode}</dd></div>
              <div><dt>Customer</dt><dd>{selectedPayment.customerName}</dd></div>
              <div><dt>Service</dt><dd>{selectedPayment.serviceName}</dd></div>
              <div><dt>Amount</dt><dd>₱{Number(selectedPayment.amount).toLocaleString()}</dd></div>
              <div><dt>Method</dt><dd>{selectedPayment.paymentMethod}</dd></div>
            </dl>
            {mockApiEnabled && <label className="field-label payment-code-field">PAYMENT CODE<input className="modal-input" inputMode="numeric" autoComplete="off" maxLength={5} value={verificationCode} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 5)); setCodeError(''); }} aria-describedby={codeError ? 'payment-code-error' : undefined} /></label>}
            {codeError && <p id="payment-code-error" className="form-error" role="alert">{codeError}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setSelectedPayment(null)}>Cancel</button>
              <button type="button" className="reject-action" disabled={!token || !mockApiEnabled} onClick={() => setPaymentConfirmation('REJECTED')}>Reject</button>
              <button type="button" className="primary-action" disabled={!token || !mockApiEnabled || busy} onClick={validatePaymentCode}>Validate code</button>
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
              <button type="button" className="primary-action" disabled={busy} onClick={() => updatePaymentStatus('VERIFIED')}>Confirm payment</button>
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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [schedule, setSchedule] = useState(normalizeWeeklySchedule());
  const [scheduleError, setScheduleError] = useState('');
  const [copied, setCopied] = useState(false);

  function validatePasswordStrength(value: string): boolean {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(value);
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
        if (!day.startTime || !day.endTime || day.startTime >= day.endTime) {
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
    if (!mockApiEnabled) {
      setResult({ success: false, title: 'Account not created', message: 'Account provisioning is not available: the configured backend has no administrator account-creation endpoint.' });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setResult({ success: false, title: 'Account not created', message: 'Sign in with the demo administrator before creating accounts.' });
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
    const form = new FormData(event.currentTarget);
    try {
    const response = await apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        firstName: String(form.get('firstName')).trim(),
        lastName: String(form.get('lastName')).trim(),
        email: form.get('email'),
        role: selectedRole.toUpperCase(),
        password,
        schedule: schedule.filter((day) => day.enabled).map((day) => ({
          dayOfWeek: day.dayOfWeek,
          startTime: day.startTime,
          endTime: day.endTime,
          isActive: true,
        })),
      }),
    });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to create demo account.');
      const staffId = payload.data?.staffId;
      if (staffId && payload.data?.schedule && payload.data.schedule.length > 0) {
        await apiFetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/schedules/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ staffId, schedule: payload.data.schedule }),
        });
      }
      const firstName = String(form.get('firstName')).trim();
      setResult({ success: true, title: 'Account created', message: `${firstName} now has ${selectedRole.toLowerCase()} access. Temporary password: ${password}` });
    } catch (cause) {
      setResult({ success: false, title: 'Account not created', message: cause instanceof Error ? cause.message : 'Unable to create demo account.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <ResultModal success={result.success} title={result.title} message={result.message} onClose={() => {
      if (result.success) window.location.reload();
      else setResult(null);
    }} />;
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="account-creation-title">
      <form className="modal-card account-creation-modal" onSubmit={createAccount} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 id="account-creation-title">Create Staff / Manager Account</h3>
          <button type="button" className="close-button" aria-label="Close account modal" onClick={onClose}>×</button>
        </div>
        <div className="modal-subtitle">Assign appropriate access rights in the hierarchy</div>

        <div className="form-grid">
          <label className="field-label" htmlFor="account-first-name">FIRST NAME<input id="account-first-name" name="firstName" className="modal-input" required maxLength={100} /></label>
          <label className="field-label" htmlFor="account-last-name">LAST NAME<input id="account-last-name" name="lastName" className="modal-input" required maxLength={100} /></label>
        </div>

        <label className="field-label" htmlFor="account-email">EMAIL ADDRESS</label>
        <input id="account-email" name="email" className="modal-input" type="email" required />

        <label className="field-label" htmlFor="account-temp-password">TEMPORARY PASSWORD</label>
        <div className="password-input-group">
          <input id="account-temp-password" className="modal-input" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} title={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
            )}
          </button>
          <button type="button" className="password-toggle" onClick={copyPassword} aria-label={copied ? 'Password copied' : 'Copy password'} title="Copy password">
            {copied ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/></svg>
            )}
          </button>
          <button type="button" className="generate-password-button" onClick={generatePassword} title="Generate a secure password">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Generate Password
          </button>
        </div>
        <p className="form-hint">Use at least 8 characters with upper/lowercase, a number, and a special character.</p>

        <label className="field-label" htmlFor="account-temp-password-confirm">CONFIRM PASSWORD</label>
        <div className="password-input-group">
          <input id="account-temp-password-confirm" className="modal-input" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
          <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} aria-pressed={showConfirmPassword} title={showConfirmPassword ? 'Hide password' : 'Show password'}>
            {showConfirmPassword ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
            )}
          </button>
        </div>

        <label className="field-label">ASSIGN ROLE (HIERARCHY)</label>
        <div className="role-grid">
          <button type="button" className={`role-option${selectedRole === 'Manager' ? ' active' : ''}`} onClick={() => setSelectedRole('Manager')}>
            <strong>Manager</strong>
            <span>Can manage services &amp; bookings</span>
          </button>
          <button type="button" className={`role-option${selectedRole === 'Staff' ? ' active' : ''}`} onClick={() => setSelectedRole('Staff')}>
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

        {!mockApiEnabled && <p className="form-hint">This configured backend does not support administrator-created accounts.</p>}

        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-action" disabled={!mockApiEnabled || submitting}>{submitting ? 'Creating…' : 'Save Account'}</button>
        </div>
      </form>
    </div>
  );
}


function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
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
      onLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <aside className="login-brand-panel">
        <div className="login-brand-head">
          <span className="login-monogram" aria-hidden="true">R</span>
          <div className="login-wordmark-block">
            <p className="login-wordmark">ROYALTY</p>
            <p className="login-brand-studio">Hair &amp; Nails Studio</p>
          </div>
        </div>
        <div className="login-brand-rule" aria-hidden="true" />
        <div className="login-brand-copy">
          <p className="login-brand-overline">Admin &amp; Staff Access</p>
          <p className="login-brand-note">
            Secure sign-in for the Royalty team platform — appointments,
            services, staff, and payments, managed with care.
          </p>
        </div>
        <p className="login-brand-foot">Management System</p>
      </aside>

      <main className="login-form-panel">
        <div className="login-pane">
          <header className="login-pane-header">
            <p className="login-overline">Studio Access</p>
            <h1 className="login-title">Welcome back.</h1>
            <p className="login-lede">Sign in to the Royalty team platform to manage appointments, services, staff, and payments.</p>
          </header>
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label className="login-field-label" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                className="login-input"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                autoComplete="username"
                placeholder="you@royalty.studio"
                required
              />
            </div>
            <div className="login-field">
              <label className="login-field-label" htmlFor="login-password">Password</label>
              <div className="login-password-group">
                <input
                  id="login-password"
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                  )}
                </button>
              </div>
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
            {mockApiEnabled && (
              <aside className="login-demo" aria-label="Development demo account">
                <p className="login-demo-title">Development demo account</p>
                <dl className="login-demo-list">
                  <div className="login-demo-row">
                    <dt>Email</dt>
                    <dd>admin@seed.royalty.local</dd>
                  </div>
                  <div className="login-demo-row">
                    <dt>Password</dt>
                    <dd>RoyaltyDemo2026!</dd>
                  </div>
                </dl>
                <p className="login-demo-note">Fictional browser data for local Vite development only.</p>
              </aside>
            )}
          </form>
          <footer className="login-footer">
            <p>Royalty Hair &amp; Nails Studio</p>
          </footer>
        </div>
      </main>
    </div>
  );
}

function LoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: () => void }) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const formData = new FormData(event.currentTarget);

    try {
      const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const response = await apiFetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.get('email'), password: formData.get('password') }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Unable to sign in. Check your credentials and API connection.');
      storeAccessTokens(payload.data.accessToken, payload.data.refreshToken);
      onLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="login-title">
      <form className="modal-card login-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 id="login-title">Sign in to Royalty</h3>
          <button type="button" className="close-button" aria-label="Close sign in" onClick={onClose}>×</button>
        </div>
        <label className="field-label" htmlFor="login-email">EMAIL ADDRESS</label>
        <input className="modal-input" id="login-email" name="email" type="email" autoComplete="username" required />
        <label className="field-label" htmlFor="login-password">PASSWORD</label>
        <input className="modal-input" id="login-password" name="password" type="password" autoComplete="current-password" required />
        {mockApiEnabled && <p className="form-hint">Demo only: admin@seed.royalty.local · RoyaltyDemo2026!</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-action" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}

export default App;
