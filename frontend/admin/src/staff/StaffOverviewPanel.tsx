import { useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  ErrorState,
  SkeletonRegion,
  StatCardSkeleton,
  ListSkeleton,
  Panel,
  StatCard,
  StatusBadge,
  formatDate,
  formatMoney,
  formatTime,
  localDateKey,
} from '../shared/ui';
import { staffApi, type StaffAppointment, type StaffProfile, type StaffServiceInfo } from './staffApi';

/**
 * The staff member's personal overview.
 *
 * It counts only the signed-in member's own records: their appointments, the
 * services they are assigned to perform, and their current availability.
 */
export function StaffOverviewPanel() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [appointments, setAppointments] = useState<StaffAppointment[] | null>(null);
  const [services, setServices] = useState<StaffServiceInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    Promise.all([
      staffApi.getProfile(),
      staffApi.listAppointments(),
      staffApi.listServices(),
    ])
      .then(([loadedProfile, loadedAppointments, loadedServices]) => {
        if (!active) return;
        setProfile(loadedProfile);
        setAppointments(loadedAppointments);
        setServices(loadedServices);
        setLoading(false);
      })
      .catch((cause) => {
        if (!active) return;
        setLoadError(cause instanceof Error ? cause.message : 'Your overview could not be loaded.');
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => {
    const today = localDateKey(new Date());
    const nowStamp = new Date().toISOString().slice(0, 16);
    const all = appointments ?? [];
    const todays = all
      .filter((appointment) => appointment.appointmentDate === today)
      .sort((left, right) => left.startTime.localeCompare(right.startTime));
    const upcoming = all
      .filter((appointment) => `${appointment.appointmentDate}T${appointment.endTime}` >= nowStamp)
      .sort((left, right) => `${left.appointmentDate}T${left.startTime}`.localeCompare(`${right.appointmentDate}T${right.startTime}`));
    const completed = all.filter((appointment) => appointment.status === 'COMPLETED');
    const next = upcoming.find((appointment) => appointment.status === 'CONFIRMED' || appointment.status === 'RESERVED');
    return { today: today, todays, upcoming, completed, next, total: all.length };
  }, [appointments]);

  if (loading) {
    return (
      <SkeletonRegion label="Loading your day">
        <div className="stats-grid four-col">
          {Array.from({ length: 4 }, (_, index) => <StatCardSkeleton key={index} />)}
        </div>
        <ListSkeleton rows={3} />
      </SkeletonRegion>
    );
  }
  if (loadError) return <ErrorState>{loadError}</ErrorState>;

  return (
    <>
      <div className="stats-grid four-col staff-metrics">
        <StatCard label="Today" value={summary.todays.length} note={formatDate(summary.today)} />
        <StatCard label="Upcoming" value={summary.upcoming.length} note="Bookings still to come" />
        <StatCard label="Completed" value={summary.completed.length} note="All time" />
        <StatCard label="My Services" value={(services ?? []).length} note="Assigned to you" />
      </div>

      <div className="two-col-panel">
        <Panel title="Today's Bookings" meta={`${summary.todays.length} today`} className="side-panel">
          {summary.todays.length === 0 ? (
            <EmptyState>No bookings are scheduled for today.</EmptyState>
          ) : (
            <ul className="summary-list">
              {summary.todays.map((appointment) => (
                <li key={appointment.id}>
                  <span>
                    {formatTime(appointment.startTime)} – {formatTime(appointment.endTime)}
                    <small>
                      {appointment.customer
                        ? `${appointment.customer.firstName} ${appointment.customer.lastName}`
                        : 'Client not recorded'}
                      {' · '}
                      {appointment.services.map((service) => service.serviceName).join(', ') || 'Salon appointment'}
                    </small>
                  </span>
                  <span className={`status-badge ${appointment.status === 'CONFIRMED' ? 'status-confirmed' : 'status-reserved'}`}>
                    {appointment.status === 'CONFIRMED' ? 'Confirmed' : 'Reserved'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Next Appointment" className="side-panel">
          {summary.next ? (
            <ul className="summary-list">
              <li>
                <span>When</span>
                <strong>{formatDate(summary.next.appointmentDate)} · {formatTime(summary.next.startTime)}</strong>
              </li>
              <li>
                <span>Client</span>
                <strong>{summary.next.customer ? `${summary.next.customer.firstName} ${summary.next.customer.lastName}` : 'Not recorded'}</strong>
              </li>
              <li>
                <span>Service</span>
                <strong>{summary.next.services.map((service) => service.serviceName).join(', ') || 'Salon appointment'}</strong>
              </li>
              <li>
                <span>Total</span>
                <strong>{formatMoney(summary.next.totalAmount)}</strong>
              </li>
              <li><span>Status</span><span><StatusBadge status={summary.next.status} /></span></li>
            </ul>
          ) : (
            <EmptyState>You have no upcoming bookings.</EmptyState>
          )}
        </Panel>
      </div>

      <Panel title="Services I Can Perform" meta={`${(services ?? []).length} assigned`} className="side-panel">
        {(services ?? []).length === 0 ? (
          <EmptyState>No services are assigned to you yet.</EmptyState>
        ) : (
          <ul className="summary-list">
            {(services ?? []).map((service) => (
              <li key={service.id}>
                <span>
                  {service.name}
                  <small>{service.categoryName} · {service.durationMinutes} min</small>
                </span>
                <strong>{formatMoney(service.price)}</strong>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
