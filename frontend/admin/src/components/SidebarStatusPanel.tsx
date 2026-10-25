import { useEffect, useState } from 'react';
import { apiFetch, getAccessToken } from '../api';
import { CustomerAvatar } from './CustomerAvatar';
import { formatTime, localDateKey } from '../shared/ui';

/**
 * A short summary for the sidebar.
 *
 * It reports what an administrator checks first — who is booked in today and
 * how many items are still waiting for a decision — and it fills the space
 * below the navigation rather than leaving a gap.
 *
 * The figures come from the same endpoints the dashboard itself reads, and
 * they follow the same rules: the date is the local calendar day, a booking
 * counts as pending only while it is still RESERVED, and a payment counts
 * only while it is UNVERIFIED. Each figure is counted once, from a single
 * response, so nothing is tallied twice.
 */

interface SidebarStatus {
  pendingAppointments: number;
  unverifiedPayments: number;
  /** True when the response held only part of the records. */
  appointmentTotalIsPartial: boolean;
  paymentTotalIsPartial: boolean;
}

interface TodayBooking {
  id: string;
  time: string;
  customerName: string;
  serviceName: string;
}

const SCHEDULE_LIMIT = 4;
/** A page large enough that the usual case is the whole record set. */
const PAGE_SIZE = 200;

export function SidebarStatusPanel() {
  const [status, setStatus] = useState<SidebarStatus | null>(null);
  const [today, setToday] = useState<TodayBooking[]>([]);
  const [todayTotal, setTodayTotal] = useState(0);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const controller = new AbortController();

    // The two lists are read separately, so one unavailable endpoint does not
    // hide the other. The payments endpoint is not part of the live API, so
    // its absence is expected there and the bookings still appear.
    apiFetch(`${baseUrl}/appointments?page=1&limit=${PAGE_SIZE}`, { headers, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const appointments = payload?.data?.appointments ?? [];
        const total = Number(payload?.data?.total ?? appointments.length);

        const todayKey = localDateKey(new Date());
        const todaysBookings = appointments
          .filter((item: any) => item.appointmentDate === todayKey)
          .filter((item: any) => item.status !== 'CANCELLED')
          .sort((left: any, right: any) => String(left.startTime).localeCompare(String(right.startTime)))
          .map((item: any) => ({
            id: item.id,
            time: formatTime(String(item.startTime ?? '')),
            customerName: item.customer ? `${item.customer.firstName} ${item.customer.lastName ?? ''}`.trim() : 'Customer',
            serviceName: item.services?.[0]?.serviceName ?? 'Salon service',
          }));

        setTodayTotal(todaysBookings.length);
        setToday(todaysBookings.slice(0, SCHEDULE_LIMIT));
        setStatus((current) => ({
          pendingAppointments: appointments.filter((item: any) => item.status === 'RESERVED').length,
          unverifiedPayments: current?.unverifiedPayments ?? 0,
          appointmentTotalIsPartial: total > appointments.length,
          paymentTotalIsPartial: current?.paymentTotalIsPartial ?? false,
        }));
      })
      .catch(() => undefined);

    apiFetch(`${baseUrl}/payments?page=1&limit=${PAGE_SIZE}`, { headers, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const payments = payload?.data?.payments ?? [];
        const total = Number(payload?.data?.total ?? payments.length);
        setStatus((current) => ({
          pendingAppointments: current?.pendingAppointments ?? 0,
          unverifiedPayments: payments.filter((item: any) => item.status === 'UNVERIFIED').length,
          appointmentTotalIsPartial: current?.appointmentTotalIsPartial ?? false,
          paymentTotalIsPartial: total > payments.length,
        }));
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  const hasAttention = status && (status.pendingAppointments > 0 || status.unverifiedPayments > 0);
  if (!status && today.length === 0) return null;

  return (
    <div className="sidebar-status">
      {today.length > 0 && (
        <>
          <p className="nav-section">Today&rsquo;s schedule</p>
          <ul className="sidebar-schedule-list">
            {today.map((booking) => (
              <li key={booking.id}>
                <span className="sidebar-schedule-time">{booking.time}</span>
                <span className="sidebar-schedule-detail">
                  <span className="person-inline">
                    <CustomerAvatar name={booking.customerName} />
                    <strong>{booking.customerName}</strong>
                  </span>
                  <small>{booking.serviceName}</small>
                </span>
              </li>
            ))}
          </ul>
          {todayTotal > today.length && (
            <p className="sidebar-schedule-more">
              Showing {today.length} of {todayTotal} bookings
            </p>
          )}
        </>
      )}

      {hasAttention && (
        <>
          <p className="nav-section">Needs attention</p>
          <ul className="sidebar-status-list">
            {status!.pendingAppointments > 0 && (
              <li>
                <span className="sidebar-status-dot" aria-hidden="true" />
                <span>
                  <strong>{status!.pendingAppointments}{status!.appointmentTotalIsPartial ? '+' : ''}</strong> booking{status!.pendingAppointments === 1 ? '' : 's'} awaiting confirmation
                </span>
              </li>
            )}
            {status!.unverifiedPayments > 0 && (
              <li>
                <span className="sidebar-status-dot" aria-hidden="true" />
                <span>
                  <strong>{status!.unverifiedPayments}{status!.paymentTotalIsPartial ? '+' : ''}</strong> payment{status!.unverifiedPayments === 1 ? '' : 's'} to verify
                </span>
              </li>
            )}
          </ul>
        </>
      )}

    </div>
  );
}
