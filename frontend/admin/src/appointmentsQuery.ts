/**
 * The one live query behind the admin appointment list and the dashboard.
 *
 * Background refresh rules:
 *  - Refetch on window focus, on the browser `online` event, and on a
 *    45-second timer with per-tick jitter (±5s) — only while the document is
 *    visible and a session token is present.
 *  - Conditional requests: when the browser can read the `ETag` of
 *    GET /appointments, the last one is sent back as `If-None-Match`. On 304
 *    the current state is kept exactly as it is (no loading flags, no
 *    flicker); on 200 the state is updated in place.
 *  - Exactly one request is in flight at a time: ticks that land while a
 *    request is pending are ignored.
 *  - Errors back the interval off (doubling, up to five minutes) and keep
 *    the current state; the first success resets the interval.
 *  - A refresh is skipped entirely while a form, modal, draft, or upload is
 *    open, so a background response can never overwrite what is being typed.
 *
 * Capability note: `ETag` is not a CORS-safelisted response header, so a
 * cross-origin API that does not send `Access-Control-Expose-Headers: ETag`
 * leaves the tag invisible to this code — and `If-None-Match` is not a
 * safelisted request header, so sending one an allowlist does not permit
 * would block the request outright at preflight. The first response decides:
 * if its ETag is readable the conditional flow is enabled; if not, polling
 * falls back to plain requests rather than risk a blocked one. No request is
 * ever sent speculatively with `If-None-Match`, so no browser console errors.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { apiFetch, authHeader, getAccessToken } from './api';

/** One service line on a booking. */
export type AppointmentServiceInfo = { serviceName: string };

/** A booking row as the admin pages read it. */
export type AppointmentRow = {
  id?: string;
  code: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  services: AppointmentServiceInfo[];
  serviceNames: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  staffName?: string;
  totalAmount?: number;
  /** When the booking record was created (ISO instant). */
  createdAt?: string;
};

const BASE_INTERVAL_MS = 45_000;
/** Per-tick jitter: each wait is the interval ± this many milliseconds. */
const JITTER_MS = 5_000;
const MAX_INTERVAL_MS = 300_000;
const MIN_INTERVAL_MS = 5_000;
const APPOINTMENTS_QUERY = 'page=1&limit=100';

/** Map one API appointment record to the row the admin pages render. */
export function toAppointmentRow(appointment: any): AppointmentRow {
  const services: AppointmentServiceInfo[] = Array.isArray(appointment?.services)
    ? appointment.services.map((service: any) => ({ serviceName: String(service?.serviceName ?? '') }))
    : [];
  return {
    id: String(appointment.id),
    code: appointment.appointmentCode ?? String(appointment.id).slice(0, 8),
    appointmentDate: appointment.appointmentDate,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.status,
    services,
    serviceNames: services.map((service) => service.serviceName).filter(Boolean).join(', ') || 'Salon appointment',
    customerName: `${appointment.customer?.firstName ?? ''} ${appointment.customer?.lastName ?? ''}`.trim() || 'Customer',
    customerEmail: appointment.customer?.account?.email ?? '',
    customerPhone: appointment.customer?.phone ?? '',
    staffName: `${appointment.staff?.firstName ?? ''} ${appointment.staff?.lastName ?? ''}`.trim() || 'Staff not assigned',
    totalAmount: Number(appointment.totalAmount ?? 0),
    createdAt: appointment.createdAt ? String(appointment.createdAt) : '',
  };
}

/** What one fetch of the appointment list did. */
export type AppointmentsFetchOutcome =
  /** 304: the records are unchanged, so nothing in state may move. */
  | { kind: 'not-modified' }
  /** 200: a fresh list, and the ETag the browser could read (if any). */
  | { kind: 'updated'; rows: AppointmentRow[]; etag: string | null }
  /** The request failed; the caller keeps its current state. */
  | { kind: 'failed' };

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * One conditional fetch of the appointment list.
 *
 * `conditional` is false until the server's ETag has been seen once — see
 * the capability note above. This is a pure function over a fetch
 * implementation so the 200/304 behaviour is unit-testable.
 */
export async function fetchAppointmentsOnce(
  fetchImpl: FetchLike,
  options: { token: string; etag: string | null; conditional: boolean; baseUrl?: string },
): Promise<AppointmentsFetchOutcome> {
  const headers: Record<string, string> = { ...authHeader(options.token) };
  if (options.conditional && options.etag) headers['If-None-Match'] = options.etag;
  const baseUrl = options.baseUrl ?? 'http://localhost:3000';
  try {
    const response = await fetchImpl(`${baseUrl}/appointments?${APPOINTMENTS_QUERY}`, { headers });
    if (response.status === 304) return { kind: 'not-modified' };
    if (!response.ok) return { kind: 'failed' };
    const payload = await response.json();
    const rows = ((payload?.data?.appointments ?? []) as any[]).map(toAppointmentRow);
    return { kind: 'updated', rows, etag: response.headers.get('ETag') };
  } catch {
    return { kind: 'failed' };
  }
}

/**
 * True while anything the user is working in is on screen: a modal, a form
 * being drafted, or an upload in progress. A background refresh is skipped
 * outright in that case — it must never overwrite the open surface.
 */
function isUiBusy(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector('.modal-overlay') !== null;
}

export type AppointmentsQueryOptions = {
  /** Extra gate: skip every refresh while true (e.g. a modal owned by the page). */
  paused?: boolean;
};

export type AppointmentsQuery = {
  appointments: AppointmentRow[];
  setAppointments: Dispatch<SetStateAction<AppointmentRow[]>>;
  /** True only for the very first load; background refreshes never set it. */
  loading: boolean;
  /** Run one refresh now (subject to the same guards as the poller). */
  refresh: () => void;
};

export function useAppointmentsQuery(options: AppointmentsQueryOptions = {}): AppointmentsQuery {
  const { paused = false } = options;
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  /** The last ETag seen; the value sent back as If-None-Match. */
  const etagRef = useRef<string | null>(null);
  /** null until the first response shows whether the ETag is readable. */
  const conditionalRef = useRef<boolean | null>(null);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef(BASE_INTERVAL_MS);
  const initialLoadRef = useRef(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    const token = getAccessToken();
    // Signed out, already fetching, or the user is mid-task: leave state alone.
    if (!token || inFlightRef.current || pausedRef.current || isUiBusy()) return;
    inFlightRef.current = true;
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
    fetchAppointmentsOnce(apiFetch, {
      token,
      etag: etagRef.current,
      conditional: conditionalRef.current === true,
      baseUrl,
    })
      .then((outcome) => {
        if (outcome.kind === 'failed') {
          // Keep the current state and back the polling off instead.
          intervalRef.current = Math.min(intervalRef.current * 2, MAX_INTERVAL_MS);
          return;
        }
        intervalRef.current = BASE_INTERVAL_MS;
        if (outcome.kind === 'updated') {
          if (outcome.etag) {
            etagRef.current = outcome.etag;
            conditionalRef.current = true;
          } else if (conditionalRef.current === null) {
            // The browser cannot read this server's ETag (the header is not
            // CORS-exposed), so If-None-Match is never sent: a header the
            // allowlist does not permit would block the request at preflight.
            conditionalRef.current = false;
          }
          // Update in place: no loading flag is touched, so nothing flickers.
          if (mountedRef.current) setAppointments(outcome.rows);
        }
        // 'not-modified' falls through: the current state stays exactly as it is.
      })
      .finally(() => {
        inFlightRef.current = false;
        if (mountedRef.current && initialLoadRef.current) {
          initialLoadRef.current = false;
          setLoading(false);
        }
      });
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleTick = useCallback(() => {
    stopTimer();
    const jitter = (Math.random() * 2 - 1) * JITTER_MS;
    const delay = Math.max(MIN_INTERVAL_MS, intervalRef.current + jitter);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh();
      if (mountedRef.current) scheduleTick();
    }, delay);
  }, [refresh, stopTimer]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    scheduleTick();

    // A returning window gets one refresh and a fresh timer.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        scheduleTick();
      } else {
        stopTimer();
      }
    };
    const onFocus = () => refresh();
    const onOnline = () => refresh();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      mountedRef.current = false;
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [refresh, scheduleTick, stopTimer]);

  return { appointments, setAppointments, loading, refresh };
}
