import { useEffect, useState } from 'react';
import { useDialogBehavior } from '../components/useDialogBehavior';
import { FieldError, invalidField } from '../shared/ui';
import { isValidFreeText, isValidTimeRange, TIME_RANGE_MESSAGE } from '../shared/validation';
import {
  EmptyState,
  ErrorState,
  SkeletonRegion,
  ListSkeleton,
  Panel,
  WEEK_DAY_LABELS,
  formatDate,
  formatTime,
  localDateKey,
} from '../shared/ui';
import { staffApi, type StaffSchedule, type StaffScheduleRequest } from './staffApi';

/**
 * The staff member's own recurring schedule and schedule requests.
 *
 * The recurring schedule is administered by a manager, so it is shown for
 * reference only. A staff member asks for a change with a schedule request,
 * which a manager then approves or rejects.
 */

const REQUEST_STATUS_BADGE: Record<string, string> = {
  PENDING: 'status-reserved',
  APPROVED: 'status-completed',
  REJECTED: 'status-cancelled',
};

const REQUEST_STATUS_TEXT: Record<string, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

function requestStatusBadge(status: string): string {
  return REQUEST_STATUS_BADGE[status] ?? 'status-noshow';
}

function requestStatusText(status: string): string {
  return REQUEST_STATUS_TEXT[status] ?? status;
}

export function StaffSchedulePanel() {
  const [schedules, setSchedules] = useState<StaffSchedule[] | null>(null);
  const [requests, setRequests] = useState<StaffScheduleRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const closeForm = () => setShowRequestForm(false);
  const formRef = useDialogBehavior<HTMLFormElement>(closeForm, showRequestForm);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const [loadedSchedules, loadedRequests] = await Promise.all([
        staffApi.listSchedules(),
        staffApi.listScheduleRequests(),
      ]);
      setSchedules(loadedSchedules);
      setRequests(loadedRequests);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Your schedule could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const date = String(form.get('requestedDate') ?? '');
    const requestType = String(form.get('requestType') ?? '').trim();
    const reason = String(form.get('reason') ?? '').trim();
    const startTime = String(form.get('requestedStartTime') ?? '').trim();
    const endTime = String(form.get('requestedEndTime') ?? '').trim();

    // Each field is checked by its own rule, and the message for the field
    // that is wrong is shown beside it.
    const errors: Record<string, string> = {};
    if (!date) errors.requestedDate = 'Choose a date for the request.';
    if (!requestType) errors.requestType = 'Describe the type of change you are requesting.';
    else if (requestType.length > 20) errors.requestType = 'Keep the type under 20 characters.';
    if (startTime && endTime && !isValidTimeRange(startTime, endTime)) {
      errors.requestedEndTime = TIME_RANGE_MESSAGE;
    }
    if (!isValidFreeText(reason)) {
      errors.reason = 'The reason contains characters that cannot be stored.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      // The form stays open and keeps what was typed.
      for (const field of ['requestedDate', 'requestType', 'requestedStartTime', 'requestedEndTime', 'reason']) {
        if (!errors[field]) continue;
        event.currentTarget.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
        break;
      }
      setSubmitting(false);
      return;
    }

    try {
      const created = await staffApi.createScheduleRequest({
        // The API expects an ISO timestamp and reads the calendar date from it.
        // Build it at UTC midnight so the date the staff member chose is the
        // date that is stored, regardless of the browser's timezone.
        requestedDate: new Date(`${date}T00:00:00.000Z`).toISOString(),
        ...(startTime ? { requestedStartTime: startTime } : {}),
        ...(endTime ? { requestedEndTime: endTime } : {}),
        requestType,
        ...(reason ? { reason } : {}),
      });
      setRequests((current) => [created, ...(current ?? [])]);
      setShowRequestForm(false);
      setNotice('Your schedule request was submitted and is awaiting review.');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The request could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SkeletonRegion label="Loading your schedule">
        <ListSkeleton rows={4} />
      </SkeletonRegion>
    );
  }
  if (loadError) return <ErrorState>{loadError}</ErrorState>;

  const activeDays = (schedules ?? []).filter((schedule) => schedule.isActive)
    .sort((left, right) => left.dayOfWeek - right.dayOfWeek);
  // The API requires a date that is still in the future, so today is not a
  // valid choice and the picker starts at tomorrow.
  const earliestDate = localDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));

  return (
    <>
      {notice && <p className="form-hint" role="status">{notice}</p>}

      <div className="two-col-panel">
        <Panel
          title="My Weekly Schedule"
          meta={activeDays.length ? `${activeDays.length} working days` : 'Not scheduled'}
        >
          {activeDays.length === 0 ? (
            <EmptyState>No recurring schedule is set for you yet.</EmptyState>
          ) : (
            <ul className="summary-list">
              {activeDays.map((schedule) => (
                <li key={schedule.id}>
                  <span>{WEEK_DAY_LABELS[schedule.dayOfWeek - 1]}</span>
                  <strong>{formatTime(schedule.startTime)} – {formatTime(schedule.endTime)}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="form-hint">Recurring hours are set by a manager. Request a change if a day does not suit.</p>
        </Panel>

        <Panel
          title="My Schedule Requests"
          meta={`${(requests ?? []).length} submitted`}
          className="side-panel"
          actions={<button type="button" className="primary-button" onClick={() => setShowRequestForm(true)}>Request a change</button>}
        >
          {(requests ?? []).length === 0 ? (
            <EmptyState>You have not submitted any schedule requests.</EmptyState>
          ) : (
            <ul className="summary-list">
              {(requests ?? []).map((request) => (
                <li key={request.id}>
                  <span>
                    {formatDate(request.requestedDate)}
                    {request.requestedStartTime ? ` · ${formatTime(request.requestedStartTime)}` : ''}
                    <small className="request-type">{request.requestType}</small>
                  </span>
                  <span className={`status-badge ${requestStatusBadge(request.status)}`}>{requestStatusText(request.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {showRequestForm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="schedule-request-title" onClick={closeForm}>
          <form ref={formRef} className="modal-card" onSubmit={submitRequest} onClick={(event) => event.stopPropagation()} noValidate>
            <div className="modal-header">
              <h3 id="schedule-request-title">Request a schedule change</h3>
              <button type="button" className="close-button" aria-label="Close request form" onClick={closeForm}>×</button>
            </div>
            <div className="modal-subtitle">A manager reviews every request before it takes effect.</div>

            <label className="field-label" htmlFor="request-date">DATE</label>
            <input id="request-date" name="requestedDate" type="date" className="modal-input" min={earliestDate} required
              onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.requestedDate; return next; })}
              {...invalidField('request-date-error', fieldErrors.requestedDate)} />
            <FieldError id="request-date-error" message={fieldErrors.requestedDate} />

            <label className="field-label" htmlFor="request-type">TYPE OF CHANGE</label>
            <input id="request-type" name="requestType" className="modal-input" maxLength={20} placeholder="e.g. Day off" required
              onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.requestType; return next; })}
              {...invalidField('request-type-error', fieldErrors.requestType)} />
            <FieldError id="request-type-error" message={fieldErrors.requestType} />

            <div className="form-grid">
              <label className="field-label" htmlFor="request-start">START TIME (OPTIONAL)
                <input id="request-start" name="requestedStartTime" type="time" className="modal-input"
                  onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.requestedEndTime; return next; })} />
              </label>
              <label className="field-label" htmlFor="request-end">END TIME (OPTIONAL)
                <input id="request-end" name="requestedEndTime" type="time" className="modal-input"
                  onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.requestedEndTime; return next; })}
                  {...invalidField('request-end-error', fieldErrors.requestedEndTime)} />
                <FieldError id="request-end-error" message={fieldErrors.requestedEndTime} />
              </label>
            </div>

            <label className="field-label" htmlFor="request-reason">REASON (OPTIONAL)</label>
            <input id="request-reason" name="reason" className="modal-input" maxLength={500} placeholder="Anything your manager should know"
              onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.reason; return next; })}
              {...invalidField('request-reason-error', fieldErrors.reason)} />
            <FieldError id="request-reason-error" message={fieldErrors.reason} />

            {formError && <p className="form-error" role="alert">{formError}</p>}

            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={closeForm}>Cancel</button>
              <button type="submit" className="primary-action" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit request'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
