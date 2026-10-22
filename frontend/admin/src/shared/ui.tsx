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

/**
 * The message shown under a field that will not accept what was typed.
 *
 * The message is a sentence that says how to fix the problem, not a red
 * border on its own. It is linked to the field with `aria-describedby` and
 * announced as an alert, so a screen reader reads it when it appears.
 */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p className="field-error" id={id} role="alert">{message}</p>;
}

/**
 * The attributes a field carries when it holds something that will not be
 * accepted. The message is linked to the field, and the field is marked
 * invalid for assistive technology.
 */
export function invalidField(id: string, message?: string) {
  return {
    'aria-invalid': message ? (true as const) : undefined,
    'aria-describedby': message ? id : undefined,
  };
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

/* ==========================================================================
   Loading skeletons

   A skeleton is a placeholder shaped like the content that is on its way.
   One system serves both dashboards, so every panel waits in the same way
   and the page does not jump when the real content arrives.

   The shapes are decorative: they are hidden from assistive technology,
   and the region around them carries a single status message instead. A
   screen reader hears "Loading the accounts", not twenty empty rows.
   ========================================================================== */

/**
 * One placeholder shape.
 *
 * It carries no meaning, so it is hidden from assistive technology and
 * from the accessibility tree.
 */
export function Skeleton({ width, height, radius, className = '' }: {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
}) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius }}
    />
  );
}

/**
 * A region that is loading.
 *
 * The region announces itself once, and holds the shapes that stand in
 * for the content. It matches the shape of the content it replaces, so
 * the page barely moves when the real figures arrive.
 */
export function SkeletonRegion({ label, className = '', children }: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`skeleton-region ${className}`.trim()} role="status" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}

/** The placeholder for a statistic card: a label, a figure and a note. */
export function StatCardSkeleton() {
  return (
    <div className="stat-card skeleton-card" aria-hidden="true">
      <Skeleton width="58%" height={10} />
      <Skeleton width="42%" height={26} radius={6} />
      <Skeleton width="36%" height={9} />
    </div>
  );
}

/** The placeholder for a table: rows of cells shaped like the columns. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div className="skeleton-row" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} height={12} width={column === 0 ? '70%' : '52%'} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The placeholder for a chart: a plot surface with the axis in place. */
export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="skeleton-chart" aria-hidden="true" style={{ height }}>
      <Skeleton className="skeleton-chart-axis" width="34px" height="100%" />
      <Skeleton className="skeleton-chart-plot" width="100%" height="100%" radius={6} />
    </div>
  );
}

/** The placeholder for a calendar: weekday headers and a month of days. */
export function CalendarSkeleton({ weeks = 5 }: { weeks?: number }) {
  return (
    <div className="skeleton-calendar" aria-hidden="true">
      {/* The weekday headers are part of the calendar's shape, so they are
          held in place while the month loads. */}
      <div className="skeleton-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <span key={day} className="weekday-label">{day}</span>
        ))}
      </div>
      <div className="skeleton-days">
        {Array.from({ length: weeks * 7 }, (_, day) => (
          <span key={day} className="skeleton-day">
            <Skeleton width="1.5rem" height={12} />
            <Skeleton width="72%" height={9} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** The placeholder for a list of records. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div className="skeleton-list-row" key={row}>
          <Skeleton width="44%" height={12} />
          <Skeleton width="26%" height={10} />
        </div>
      ))}
    </div>
  );
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
