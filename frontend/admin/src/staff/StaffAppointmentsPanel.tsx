import { useEffect, useMemo, useState } from 'react';
import { useDialogBehavior } from '../components/useDialogBehavior';
import { CustomerAvatar } from '../components/CustomerAvatar';
import { AppointmentCodeInput } from '../components/AppointmentCodeInput';
import { RecordPaymentModal, type RecordPaymentOption } from '../components/RecordPaymentModal';
import { canRecordPayment } from '../payments';
import { getAccessToken } from '../api';
import { currentSession } from '../session';
import {
  EmptyState,
  ErrorState,
  SkeletonRegion,
  TableSkeleton,
  Panel,
  StatusBadge,
  appointmentStatusText,
  formatDate,
  formatMoney,
  formatTime,
  localDateKey,
} from '../shared/ui';
import { staffApi, type StaffAppointment } from './staffApi';

/**
 * The staff member's own appointments.
 *
 * Which status changes are offered mirrors the API's transition table: a
 * staff member may confirm a reserved booking, and may complete or mark a
 * no-show for a confirmed one once the appointment has ended. Cancelling is
 * left to the customer or an administrator, so it is not offered here. The API
 * enforces the same rules and the remaining time guard.
 */

const STAFF_TRANSITIONS: Record<string, string[]> = {
  RESERVED: ['CONFIRMED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW'],
};

function canComplete(appointment: StaffAppointment): boolean {
  return `${appointment.appointmentDate}T${appointment.endTime}` <= new Date().toISOString().slice(0, 16);
}

export function StaffAppointmentsPanel() {
  const [appointments, setAppointments] = useState<StaffAppointment[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StaffAppointment | null>(null);
  const [pending, setPending] = useState<{ appointment: StaffAppointment; status: string } | null>(null);
  const [recordTarget, setRecordTarget] = useState<StaffAppointment | null>(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const canRecord = canRecordPayment(currentSession(getAccessToken())?.role ?? null);

  const closeDetail = () => setSelected(null);
  const detailRef = useDialogBehavior<HTMLElement>(closeDetail, selected !== null);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      setAppointments(await staffApi.listAppointments());
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Your appointments could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const today = localDateKey(new Date());

  const visible = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .filter((appointment) => statusFilter === 'all' || appointment.status === statusFilter)
      .filter((appointment) => {
        // Appointment-code input (APT- + typed); the typed tail still matches
        // the customer and service lines for quick scanning.
        const needle = search.trim().toLowerCase();
        if (!needle) return true;
        const tail = needle.startsWith('apt-') ? needle.slice(4) : needle;
        const client = appointment.customer ? `${appointment.customer.firstName} ${appointment.customer.lastName}` : '';
        const services = appointment.services.map((service) => service.serviceName).join(' ');
        return (
          appointment.appointmentCode.toLowerCase().includes(needle) ||
          `${client} ${services}`.toLowerCase().includes(tail)
        );
      })
      .sort((left, right) => {
        const compare = `${left.appointmentDate}T${left.startTime}`.localeCompare(`${right.appointmentDate}T${right.startTime}`);
        return compare !== 0 ? compare : left.startTime.localeCompare(right.startTime);
      });
  }, [appointments, statusFilter, search]);

  const upcomingCount = visible.filter((appointment) => `${appointment.appointmentDate}T${appointment.endTime}` >= new Date().toISOString().slice(0, 16)).length;

  /**
   * The appointments money may be recorded against.
   *
   * The staff list has no outstanding figure — the server reports one only
   * on a payment record — so the picker shows the appointment total and the
   * API re-checks the amount against the real balance.
   */
  const recordOptions = useMemo<RecordPaymentOption[]>(() => (appointments ?? []).map((appointment) => ({
    appointmentId: appointment.id,
    appointmentCode: appointment.appointmentCode,
    label: `${appointment.customer ? `${appointment.customer.firstName} ${appointment.customer.lastName}` : 'Customer'} · ${appointment.services.map((service) => service.serviceName).join(', ') || 'Salon appointment'}`,
    detail: `${formatDate(appointment.appointmentDate)} · ${formatTime(appointment.startTime)}`,
    outstanding: null,
    total: appointment.totalAmount,
  })), [appointments]);

  async function applyStatus(appointment: StaffAppointment, status: string) {
    setActionError('');
    try {
      const updated = await staffApi.updateAppointmentStatus(appointment.id, status);
      setAppointments((current) => (current ?? []).map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setSelected((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
      setPending(null);
      setMessage(`Appointment ${appointment.appointmentCode} marked ${appointmentStatusText(status).toLowerCase()}.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The appointment could not be updated.');
    }
  }

  if (loading) {
    return (
      <SkeletonRegion label="Loading your appointments">
        <TableSkeleton rows={4} columns={4} />
      </SkeletonRegion>
    );
  }
  if (loadError) return <ErrorState>{loadError}</ErrorState>;

  return (
    <>
      {message && <p className="form-hint" role="status">{message}</p>}
      {actionError && <ErrorState>{actionError}</ErrorState>}

      <Panel
        title="My Appointments"
        meta={`${visible.length} shown · ${upcomingCount} upcoming`}
        className="table-panel large-table"
        actions={(
          <>
            <div style={{ minWidth: 230 }}>
              <AppointmentCodeInput
                label="APPOINTMENT CODE"
                value={search}
                onChange={setSearch}
                inputClassName="search-input"
                placeholder="52C86F7E…"
              />
            </div>
            <label className="sr-only" htmlFor="staff-appointment-status">Filter by status</label>
            <select
              id="staff-appointment-status"
              className="search-input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="RESERVED">Reserved</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="COMPLETED">Completed</option>
              <option value="NO_SHOW">No show</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </>
        )}
      >
        {visible.length === 0 ? (
          <EmptyState>No appointments match this view.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table role="table" className="responsive-table">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">Date</th>
                  <th role="columnheader" scope="col">Time</th>
                  <th role="columnheader" scope="col">Client</th>
                  <th role="columnheader" scope="col">Service</th>
                  <th role="columnheader" scope="col">Status</th>
                  <th role="columnheader" scope="col">Actions</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {visible.map((appointment) => (
                  <tr role="row" key={appointment.id}>
                    <td role="cell" data-label="Date" data-primary>{formatDate(appointment.appointmentDate)}</td>
                    <td role="cell" data-label="Time">{formatTime(appointment.startTime)}</td>
                    <td role="cell" data-label="Client">
                      <span className="person-inline">
                        <CustomerAvatar name={appointment.customer ? `${appointment.customer.firstName} ${appointment.customer.lastName}` : 'Customer'} />
                        <span>
                          {appointment.customer
                            ? `${appointment.customer.firstName} ${appointment.customer.lastName}`
                            : 'Client not recorded'}
                        </span>
                      </span>
                    </td>
                    <td role="cell" data-label="Service">{appointment.services.map((service) => service.serviceName).join(', ') || 'Salon appointment'}</td>
                    <td role="cell" data-label="Status"><StatusBadge status={appointment.status} /></td>
                    <td className="cell-actions" role="cell" data-label="Actions">
                      <button type="button" className="link-button" onClick={() => setSelected(appointment)}>Details</button>
                      {canRecord && <button type="button" className="link-button" onClick={() => setRecordTarget(appointment)}>Record payment</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="staff-appointment-title" onClick={closeDetail}>
          <section ref={detailRef} className="modal-card appointment-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 id="staff-appointment-title">{selected.appointmentCode}</h3>
              <button type="button" className="close-button" aria-label="Close appointment details" onClick={closeDetail}>×</button>
            </div>
            <div className="modal-subtitle">{formatDate(selected.appointmentDate)}</div>
            <dl className="appointment-detail-list">
              <div><dt>Time</dt><dd>{formatTime(selected.startTime)} – {formatTime(selected.endTime)}</dd></div>
              <div><dt>Client</dt><dd><span className="person-inline"><CustomerAvatar name={selected.customer ? `${selected.customer.firstName} ${selected.customer.lastName}` : 'Customer'} /><span>{selected.customer ? `${selected.customer.firstName} ${selected.customer.lastName}` : 'Not recorded'}</span></span></dd></div>
              {selected.customer?.phone && <div><dt>Phone</dt><dd>{selected.customer.phone}</dd></div>}
              <div><dt>Service</dt><dd>{selected.services.map((service) => service.serviceName).join(', ') || 'Salon appointment'}</dd></div>
              <div><dt>Total</dt><dd>{formatMoney(selected.totalAmount)}</dd></div>
              <div><dt>Status</dt><dd><StatusBadge status={selected.status} /></dd></div>
            </dl>
            <div className="modal-actions appointment-detail-actions">
              {(STAFF_TRANSITIONS[selected.status] ?? []).map((status) => {
                const blocked = (status === 'COMPLETED' || status === 'NO_SHOW') && !canComplete(selected);
                return (
                  <button
                    key={status}
                    type="button"
                    className={status === 'NO_SHOW' ? 'reject-action' : 'primary-action'}
                    disabled={blocked}
                    title={blocked ? 'This action is available once the appointment has ended.' : undefined}
                    onClick={() => setPending({ appointment: selected, status })}
                  >
                    {status === 'CONFIRMED' ? 'Confirm booking' : status === 'COMPLETED' ? 'Mark completed' : 'Mark no-show'}
                  </button>
                );
              })}
              {canRecord && (
                <button type="button" className="secondary-action" onClick={() => { setRecordTarget(selected); closeDetail(); }}>Record payment</button>
              )}
              <button type="button" className="secondary-action" onClick={closeDetail}>Close</button>
            </div>
          </section>
        </div>
      )}

      {pending && (
        <div className="modal-overlay confirm-layer" role="dialog" aria-modal="true" aria-labelledby="staff-status-confirm" onClick={() => setPending(null)}>
          <section className="modal-card confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 id="staff-status-confirm">Mark {appointmentStatusText(pending.status).toLowerCase()}?</h3>
              <button type="button" className="close-button" aria-label="Close" onClick={() => setPending(null)}>×</button>
            </div>
            <p>
              Appointment {pending.appointment.appointmentCode} will be marked as {appointmentStatusText(pending.status).toLowerCase()}.
              {pending.status === 'NO_SHOW' ? ' This records that the client did not attend.' : ''}
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setPending(null)}>Cancel</button>
              <button
                type="button"
                className={pending.status === 'NO_SHOW' ? 'reject-action' : 'primary-action'}
                onClick={() => void applyStatus(pending.appointment, pending.status)}
              >
                Yes, mark {appointmentStatusText(pending.status).toLowerCase()}
              </button>
            </div>
          </section>
        </div>
      )}
      {recordTarget && (
        <RecordPaymentModal
          options={recordOptions}
          presetAppointmentId={recordTarget.id}
          onClose={() => setRecordTarget(null)}
          onRecorded={(payment) => {
            setRecordTarget(null);
            setMessage(`Payment recorded for ${payment.appointmentCode}.`);
          }}
        />
      )}
    </>
  );
}
