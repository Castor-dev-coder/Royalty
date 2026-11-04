import { useCallback, useEffect, useState } from 'react';
import { apiFetch, authHeader, getAccessToken } from '../api';
import { useDialogBehavior } from '../components/useDialogBehavior';
import { currentSession, readAccountSession, type AccountRole } from '../session';
import { EmptyState, ErrorState, SkeletonRegion, TableSkeleton } from '../shared/ui';

/**
 * Staff attendance: clock in, clock out, and the record of both.
 *
 * The signed-in role decides what is offered here. A staff member clocks
 * themselves in and out and sees only their own records; a manager sees every
 * record and may correct times; an administrator sees every record and may
 * correct times but has no clock buttons, because an administrator has no
 * shift. A manager may not correct their own record — the server refuses that
 * with a 403 and the control is disabled here so the boundary is visible
 * before the request is made.
 *
 * Every time on this page is shown in Asia/Manila, the studio's timezone.
 */

type AttendanceRecord = {
  id: string;
  accountId: string;
  staffId: string | null;
  firstName: string;
  lastName: string;
  role: string;
  timeIn: string | null;
  timeOut: string | null;
  openTooLong: boolean;
};

const MANILA_TIME_ZONE = 'Asia/Manila';

function baseUrl(): string {
  return import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
}

/** Format an ISO timestamp as a readable Asia/Manila date and time. */
function formatManila(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString('en-US', {
    timeZone: MANILA_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Format an ISO timestamp for a `datetime-local` input, in Asia/Manila wall time. */
function isoToManilaInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`;
}

/** Read a `datetime-local` value as Asia/Manila wall time and return an ISO timestamp. */
function manilaInputToIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

/** The signed-in account's id, read from the session or the token's claims. */
function currentAccountId(): string {
  const session = currentSession(getAccessToken());
  if (session?.id) return session.id;
  const stored = readAccountSession();
  if (stored?.id) return stored.id;
  const token = getAccessToken();
  const parts = token ? token.split('.') : [];
  if (parts.length !== 3) return '';
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1])))) as Record<string, unknown>;
    for (const claim of ['accountId', 'sub', 'id']) {
      if (typeof payload[claim] === 'string') return payload[claim] as string;
    }
  } catch {
    // A token that cannot be read leaves the id empty; the server still
    // enforces the boundary on every write.
  }
  return '';
}

function signedInRole(): AccountRole | null {
  return currentSession(getAccessToken())?.role ?? null;
}

export function AttendancePanel() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState<AttendanceRecord | null>(null);

  const role = signedInRole();
  const accountId = currentAccountId();
  const canClock = role === 'STAFF' || role === 'MANAGER';
  const canCorrect = role === 'MANAGER' || role === 'ADMIN';
  const scope = role === 'STAFF' ? 'mine' : 'all';

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    const token = getAccessToken();
    if (!token) {
      setLoadError('Sign in to view attendance records.');
      setLoading(false);
      return;
    }
    const response = await apiFetch(`${baseUrl()}/attendance?scope=${scope}`, {
      signal,
      headers: { ...authHeader(token) },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? 'Attendance records could not be loaded.');
    const rows = (payload?.data?.records ?? []) as AttendanceRecord[];
    setRecords(rows);
    setLoadError('');
  }, [scope]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadRecords(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Attendance records could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadRecords]);

  // A shift is open when the signed-in account has a record with no time out.
  const openRecord = records.find((record) => record.accountId === accountId && !record.timeOut) ?? null;

  async function clock(action: 'clock-in' | 'clock-out') {
    const token = getAccessToken();
    if (!token) { setActionError('Sign in to record attendance.'); return; }
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const response = await apiFetch(`${baseUrl()}/attendance/${action}`, {
        method: 'POST',
        headers: { ...authHeader(token) },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setActionError(payload?.message ?? (action === 'clock-in' ? 'You could not be clocked in.' : 'You could not be clocked out.'));
        return;
      }
      setNotice(action === 'clock-in' ? 'Clocked in.' : 'Clocked out.');
      await loadRecords();
    } catch {
      setActionError('The attendance request failed. Check the backend connection.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCorrection(record: AttendanceRecord, timeIn: string, timeOut: string) {
    const token = getAccessToken();
    if (!token) throw new Error('Sign in to correct attendance records.');
    const response = await apiFetch(`${baseUrl()}/attendance/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({
        timeIn: manilaInputToIso(timeIn),
        // An empty time out closes nothing: it is sent as null so a shift can
        // be re-opened when a correction removed the clock-out by mistake.
        timeOut: timeOut ? manilaInputToIso(timeOut) : null,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? 'The attendance record could not be corrected.');
    setCorrecting(null);
    setNotice('Attendance record corrected.');
    await loadRecords();
  }

  return (
    <section className="panel attendance-panel">
      <div className="panel-header compact">
        <h3>Attendance</h3>
        <span>{records.length} {records.length === 1 ? 'record' : 'records'}</span>
      </div>

      {canClock && (
        <div className="attendance-clock-row">
          <button type="button" className="primary-action" disabled={busy || Boolean(openRecord)} onClick={() => void clock('clock-in')}>
            Clock in
          </button>
          <button type="button" className="secondary-action" disabled={busy || !openRecord} onClick={() => void clock('clock-out')}>
            Clock out
          </button>
          {openRecord && (
            <span className="status-badge warning">
              On shift since {formatManila(openRecord.timeIn)}
            </span>
          )}
          {!openRecord && <span className="form-hint">No shift is currently open.</span>}
        </div>
      )}

      {notice && <p className="table-message" role="status">{notice}</p>}
      {actionError && <ErrorState>{actionError}</ErrorState>}

      {loading && (
        <SkeletonRegion label="Loading attendance records">
          <TableSkeleton rows={5} columns={5} />
        </SkeletonRegion>
      )}
      {!loading && loadError && <ErrorState>{loadError}</ErrorState>}
      {!loading && !loadError && records.length === 0 && (
        <EmptyState>{role === 'STAFF' ? 'You have no attendance records yet.' : 'No attendance records have been recorded.'}</EmptyState>
      )}
      {!loading && !loadError && records.length > 0 && (
        <div className="table-scroll">
          <table role="table" className="responsive-table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">Name</th>
                <th role="columnheader" scope="col">Role</th>
                <th role="columnheader" scope="col">Time In</th>
                <th role="columnheader" scope="col">Time Out</th>
                <th role="columnheader" scope="col">Status</th>
                {canCorrect && <th role="columnheader" scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {records.map((record) => {
                const isOwnRecord = Boolean(accountId) && record.accountId === accountId;
                const correctionBlocked = role === 'MANAGER' && isOwnRecord;
                return (
                  <tr role="row" key={record.id}>
                    <td role="cell" data-label="Name" data-primary>
                      <strong>{`${record.firstName ?? ''} ${record.lastName ?? ''}`.trim() || 'Unnamed staff member'}</strong>
                    </td>
                    <td role="cell" data-label="Role">{record.role || '—'}</td>
                    <td role="cell" data-label="Time In">{record.timeIn ? formatManila(record.timeIn) : '—'}</td>
                    <td role="cell" data-label="Time Out">{record.timeOut ? formatManila(record.timeOut) : record.timeIn ? 'Still open' : '—'}</td>
                    <td role="cell" data-label="Status">
                      {record.openTooLong
                        ? <span className="status-badge danger">Open &gt;16h</span>
                        : <span className="status-badge neutral">{record.timeOut ? 'Closed' : 'Open'}</span>}
                    </td>
                    {canCorrect && (
                      <td className="cell-actions" role="cell" data-label="Actions">
                        <button
                          type="button"
                          className="link-button"
                          disabled={correctionBlocked}
                          title={correctionBlocked ? 'A manager may not correct their own attendance record.' : 'Correct the time in and time out of this record.'}
                          onClick={() => setCorrecting(record)}
                        >
                          Correct times
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {correcting && (
        <CorrectionModal
          record={correcting}
          onClose={() => setCorrecting(null)}
          onSave={(timeIn, timeOut) => saveCorrection(correcting, timeIn, timeOut)}
        />
      )}
    </section>
  );
}

function CorrectionModal({ record, onClose, onSave }: {
  record: AttendanceRecord;
  onClose: () => void;
  onSave: (timeIn: string, timeOut: string) => Promise<void>;
}) {
  const [timeIn, setTimeIn] = useState(() => isoToManilaInput(record.timeIn));
  const [timeOut, setTimeOut] = useState(() => isoToManilaInput(record.timeOut));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useDialogBehavior<HTMLFormElement>(onClose);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!timeIn) { setError('Enter the time the shift started.'); return; }
    if (timeOut && timeOut < timeIn) { setError('The time out must be later than the time in.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSave(timeIn, timeOut);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The attendance record could not be corrected.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="attendance-correction-title" onClick={onClose}>
      <form ref={dialogRef} className="modal-card service-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()} noValidate>
        <div className="modal-header">
          <h3 id="attendance-correction-title">Correct attendance</h3>
          <button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <p className="form-hint">
          {`${record.firstName ?? ''} ${record.lastName ?? ''}`.trim() || 'This record'} · times are shown in Asia/Manila. Corrections are recorded in the audit log.
        </p>
        <label className="field-label">TIME IN
          <input className="modal-input" type="datetime-local" value={timeIn} required onChange={(event) => setTimeIn(event.target.value)} />
        </label>
        <label className="field-label">TIME OUT
          <input className="modal-input" type="datetime-local" value={timeOut} onChange={(event) => setTimeOut(event.target.value)} />
        </label>
        <p className="form-hint">Leave the time out empty to mark the shift as still open.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-action" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-action" disabled={busy}>{busy ? 'Saving…' : 'Save Correction'}</button>
        </div>
      </form>
    </div>
  );
}
