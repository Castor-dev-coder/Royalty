import type { ReactNode } from 'react';

/**
 * Presentation shared by the administrator and staff dashboards.
 *
 * These components hold the markup and the class names only. Colours come
 * from the token layer in styles.css, so a component never carries a
 * theme-specific rule and both dashboards stay visually consistent.
 */

export const APPOINTMENT_STATUS_TEXT: Record<string, string> = {
  RESERVED: 'Reserved',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No show',
};

export const APPOINTMENT_STATUS_BADGE: Record<string, string> = {
  CONFIRMED: 'status-confirmed',
  RESERVED: 'status-reserved',
  NO_SHOW: 'status-noshow',
  COMPLETED: 'status-completed',
  CANCELLED: 'status-cancelled',
};

export const WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function appointmentStatusText(status: string): string {
  return APPOINTMENT_STATUS_TEXT[status] ?? String(status).replace('_', ' ').toLowerCase();
}

export function appointmentStatusBadge(status: string): string {
  return APPOINTMENT_STATUS_BADGE[status] ?? 'status-noshow';
}

/** A status badge that always carries a text label, never colour alone. */
export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return <span className={`status-badge ${appointmentStatusBadge(status)} ${className}`.trim()}>{appointmentStatusText(status)}</span>;
}

export function StatCard({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="stat-card compact-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

export function Panel({ title, meta, actions, children, className = '' }: {
  title: string;
  meta?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <div className="panel-header compact">
        <h3>{title}</h3>
        <div className="table-tools">
          {meta ? <span>{meta}</span> : null}
          {actions}
        </div>
      </div>
      {children}
    </section>
  );
}

/** The one empty-state message used across both dashboards. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-list">{children}</p>;
}

/** The one error message used across both dashboards. */
export function ErrorState({ children }: { children: ReactNode }) {
  return <p className="form-error" role="alert">{children}</p>;
}

export function LoadingState({ children }: { children: ReactNode }) {
  return <p className="empty-list">{children}</p>;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Render a date-only or ISO timestamp as a readable local date.
 *
 * The API returns calendar dates as UTC-midnight timestamps, so a value that
 * falls exactly on midnight UTC is a calendar date, not an instant. Rendering
 * it in local time would move it to the previous day in a negative-offset
 * timezone, so the calendar date is taken from the value itself.
 */
export function formatDate(value: string): string {
  const isUtcMidnight = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?(?:Z|[+-]00:00)$/.test(value);
  if (isUtcMidnight) {
    const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})/.exec(value) ?? [];
    if (year && month && day) {
      return new Date(Number(year), Number(month) - 1, Number(day))
        .toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Render a 24-hour time as a readable local time. */
export function formatTime(value: string): string {
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour)) return value;
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour >= 12 ? ' PM' : ' AM'}`;
}

export function formatMoney(value: number): string {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
