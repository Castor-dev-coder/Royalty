import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * The admin's small charts.
 *
 * Everything here is drawn from the records the page already holds. There
 * is no invented series, no placeholder trend and no simulated live feed:
 * a chart is a reading of the same appointments and payments the tables and
 * counters use, so a figure can always be traced back to a record.
 *
 * Two rules shape the markup:
 *
 * - The value is never hover-only. Each chart states its figures as visible
 *   text, and the same figures are repeated in the accessible name of the
 *   point they belong to, so a reader using a keyboard or a screen reader
 *   gets the number without hovering anything.
 * - The marks are separate, never stacked into one strip. A chart of
 *   categories has each mark labelled and its own track, so no meaning
 *   depends on telling two touching colours apart.
 */

interface CategoryBar {
  /** A stable key for React and for the accessible name. */
  key: string;
  /** The visible label: a status name, a service name, a period. */
  label: string;
  /** The figure shown at the end of the row. */
  value: string;
  /** The share of the total, shown beside the figure when it is known. */
  share?: string;
  /** The detail shown on hover, on focus and to assistive technology. */
  detail: string;
  /** The CSS custom property that carries the bar's colour. */
  color: string;
  /** How large the bar is, as a percentage of the total being split. */
  percent: number;
  /** An optional badge shown instead of a plain text label. */
  badge?: string;
}

/**
 * The tick values for a scale that runs from zero to the peak.
 *
 * A small peak is labelled at every step, so each mark can be read against
 * it. A large peak gets a coarser scale, because a tick per booking would
 * be more labels than the chart can carry.
 */
function scaleTicks(max: number): number[] {
  if (max <= 4) return Array.from({ length: max + 1 }, (_, index) => index);
  if (max <= 12) {
    const step = Math.ceil(max / 4);
    const ticks: number[] = [];
    for (let value = 0; value <= max; value += step) ticks.push(value);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    return ticks;
  }
  return [0, Math.round(max / 2), max];
}

/**
 * A horizontal bar list: one row per category.
 *
 * The rows are separated rather than stacked, so each bar is read on its
 * own and the colour is a second cue rather than the only one.
 */
export function CategoryBars({ items, emptyMessage }: { items: CategoryBar[]; emptyMessage: string }) {
  if (items.length === 0) {
    return <p className="empty-list">{emptyMessage}</p>;
  }

  return (
    <ul className="category-bars">
      {items.map((item) => (
        <li key={item.key} className="category-bar-row">
          <span className="category-bar-label">
            {item.badge ? <span className={`status-badge ${item.badge}`}>{item.label}</span> : item.label}
          </span>
          <span
            className="category-bar-graphic"
            role="img"
            tabIndex={0}
            aria-label={item.detail}
          >
            <span className="category-bar-track">
              <span
                className="category-bar-fill"
                style={{ '--bar-width': `${Math.max(item.percent, 2)}%`, '--bar-color': `var(${item.color})` } as CSSProperties}
              />
            </span>
            <span className="category-bar-value">
              {item.value}
              {item.share ? <span className="category-bar-share">{item.share}</span> : null}
            </span>
            <span className="category-bar-detail" role="presentation">{item.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ==========================================================================
   The line chart
   ========================================================================== */

/** One position on the horizontal axis. */
export interface LineAxisPoint {
  /** A stable key: a date for a time series. */
  key: string;
  /** The short label under the axis. */
  label: string;
  /** The full label used in the tooltip and in the accessible name. */
  fullLabel: string;
}

/** One line on the chart. */
export interface LineSeries {
  /** A stable key for React and for the legend. */
  key: string;
  /** The series name, shown in the legend and in the tooltip. */
  label: string;
  /** The CSS custom property that carries the line's colour. */
  color: string;
  /** One value per axis key. A key that is absent counts as zero. */
  values: Record<string, number>;
}

interface Point {
  x: number;
  y: number;
}

const LINE_PADDING = { top: 18, right: 28, bottom: 30, left: 46 };

/**
 * A smooth path through the points.
 *
 * A plain cubic Bezier through the points is curvy, but it overshoots: it
 * dips below a low point and rises above a high one, which would show
 * values the records never held. Monotone interpolation keeps the curve
 * inside the range of the data it passes through, so the line can be soft
 * without lying about the figures.
 *
 * Only the path between the points changes. The points, their positions
 * and the figures behind them are untouched.
 */
function monotonePath(points: Point[]): string {
  const count = points.length;
  if (count === 0) return '';
  if (count === 1) return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  // The slope of each segment.
  const dx: number[] = [];
  const slope: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const run = points[index + 1].x - points[index].x;
    dx.push(run);
    slope.push(run === 0 ? 0 : (points[index + 1].y - points[index].y) / run);
  }

  // The tangent at each point.
  const tangent: number[] = new Array(count).fill(0);
  tangent[0] = slope[0];
  tangent[count - 1] = slope[count - 2];
  for (let index = 1; index < count - 1; index += 1) {
    if (slope[index - 1] * slope[index] <= 0) {
      // The data turns here, so the curve flattens rather than overshooting.
      tangent[index] = 0;
      continue;
    }
    const w1 = 2 * dx[index] + dx[index - 1];
    const w2 = dx[index] + 2 * dx[index - 1];
    tangent[index] = (w1 + w2) / (w1 / slope[index - 1] + w2 / slope[index]);
  }

  // Fritsch-Carlson: every tangent stays inside the range of its segment,
  // so the curve can never rise above a peak or dip below a trough.
  for (let index = 0; index < count - 1; index += 1) {
    if (slope[index] === 0) {
      tangent[index] = 0;
      tangent[index + 1] = 0;
      continue;
    }
    const a = tangent[index] / slope[index];
    const b = tangent[index + 1] / slope[index];
    const magnitude = a * a + b * b;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangent[index] = scale * a * slope[index];
      tangent[index + 1] = scale * b * slope[index];
    }
  }

  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < count - 1; index += 1) {
    const third = dx[index] / 3;
    path += ` C${(points[index].x + third).toFixed(2)} ${(points[index].y + tangent[index] * third).toFixed(2)}`
      + ` ${(points[index + 1].x - third).toFixed(2)} ${(points[index + 1].y - tangent[index + 1] * third).toFixed(2)}`
      + ` ${points[index + 1].x.toFixed(2)} ${points[index + 1].y.toFixed(2)}`;
  }
  return path;
}

/** The same smooth curve, closed down to the baseline. */
function monotoneAreaPath(points: Point[], baseline: number): string {
  const line = monotonePath(points);
  if (!line) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${last.x.toFixed(2)} ${baseline.toFixed(2)} L${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`;
}

/**
 * The chart measures itself, so the labels stay the same size at any width.
 *
 * The measurement is driven by a callback ref rather than by an effect,
 * because the chart renders nothing at all until its records arrive. An
 * effect would run once while the chart was still empty, find no element
 * to measure, and never run again.
 */
function useMeasuredWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((element: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => setWidth(element.clientWidth));
      observer.observe(element);
      observerRef.current = observer;
      return;
    }
    const onResize = () => setWidth(element.clientWidth);
    window.addEventListener('resize', onResize);
    observerRef.current = { disconnect: () => window.removeEventListener('resize', onResize) } as ResizeObserver;
  }, []);

  useEffect(() => () => { observerRef.current?.disconnect(); }, []);

  return [ref, width] as const;
}

/**
 * A line chart of a value over time.
 *
 * The line is drawn in the brand's champagne gold with a translucent area
 * beneath it, on a warm-tinted plot surface. A second series takes the
 * semantic colour of the state it represents, so a confirmed line and a
 * confirmed badge mean the same thing.
 *
 * The figures are readable three ways: the point's own marker, the
 * tooltip, and the accessible name of the point. The tooltip is an
 * addition, never the only way to reach a figure.
 */
export function LineChart({
  axis,
  series,
  unit,
  metricName,
  emptyMessage,
  height = 220,
  area = true,
  formatValue,
}: {
  axis: LineAxisPoint[];
  series: LineSeries[];
  /** The unit shown next to a figure, for example "bookings". */
  unit: string;
  /** The name of the metric, for example "Bookings". */
  metricName: string;
  emptyMessage: string;
  height?: number;
  /** Whether to fill the area under the line. */
  area?: boolean;
  formatValue?: (value: number) => string;
}) {
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hitRef = useRef<(HTMLButtonElement | null)[]>([]);

  const format = useCallback(
    (value: number) => (formatValue ? formatValue(value) : String(value)),
    [formatValue],
  );

  const totals = useMemo(
    () => series.map((entry) => axis.reduce((sum, point) => sum + (entry.values[point.key] ?? 0), 0)),
    [axis, series],
  );
  const grandTotal = totals.reduce((sum, value) => sum + value, 0);
  const yMax = useMemo(
    () => Math.max(0, ...series.flatMap((entry) => axis.map((point) => entry.values[point.key] ?? 0))),
    [axis, series],
  );

  // The chart is redrawn when the records change, so the line settles into
  // its new shape rather than snapping.
  const signature = useMemo(
    () => `${axis.map((point) => point.key).join('|')}#${series.map((entry) => `${entry.label}:${axis.map((point) => entry.values[point.key] ?? 0).join(',')}`).join('|')}`,
    [axis, series],
  );

  // The pointer wins while it is over the plot; the keyboard wins once the
  // pointer has gone. Leaving the plot restores the resting state.
  const active = hoverIndex ?? focusIndex;

  const plotWidth = Math.max(0, width - LINE_PADDING.left - LINE_PADDING.right);
  const plotHeight = Math.max(0, height - LINE_PADDING.top - LINE_PADDING.bottom);
  // The data sits a little inside the plot surface, so the marker at the
  // first and last position is not cut in half by the edge of the tinted
  // area.
  const dataInset = axis.length > 1 ? 14 : 0;
  const dataSpan = Math.max(0, plotWidth - dataInset * 2);
  const xFor = (index: number) =>
    LINE_PADDING.left + dataInset
    + (axis.length === 1 ? dataSpan / 2 : (index / (axis.length - 1)) * dataSpan);
  // The scale runs a little past the peak, so the highest point has room
  // above it instead of sitting on the edge of the plot.
  const yDomain = yMax === 0 ? 1 : yMax * 1.14;
  const yFor = (value: number) =>
    LINE_PADDING.top + plotHeight - (value / yDomain) * plotHeight;
  const baseline = LINE_PADDING.top + plotHeight;

  // The tooltip is measured so it can be kept inside the plot, whatever it
  // happens to contain.
  useLayoutEffect(() => {
    const element = tooltipRef.current;
    if (!element) { setTooltipSize({ width: 0, height: 0 }); return; }
    const next = { width: element.offsetWidth, height: element.offsetHeight };
    setTooltipSize((current) => (current.width === next.width && current.height === next.height ? current : next));
  }, [active, axis, series]);

  if (axis.length === 0 || grandTotal === 0) {
    return <p className="empty-list">{emptyMessage}</p>;
  }

  const ticks = scaleTicks(yMax);
  // Only label as many axis positions as there is room for.
  const labelStep = Math.max(1, Math.ceil(axis.length / Math.max(1, Math.floor(plotWidth / 46))));

  const pointsFor = (entry: LineSeries) =>
    axis.map((point, index) => ({ x: xFor(index), y: yFor(entry.values[point.key] ?? 0) }));

  const moveTo = (index: number) => {
    const next = Math.min(axis.length - 1, Math.max(0, index));
    setHoverIndex(null);
    setFocusIndex(next);
    hitRef.current[next]?.focus();
  };

  const activePoint = active !== null && active < axis.length ? axis[active] : null;
  const activeHighest = active !== null
    ? Math.max(...series.map((entry) => entry.values[axis[active].key] ?? 0))
    : 0;

  // The tooltip sits beside its own point and is kept inside the plot: it
  // is drawn in from either edge, and it flips below the point when there
  // is no room above it.
  const margin = 10;
  const halfWidth = tooltipSize.width / 2;
  const pointX = active !== null ? xFor(active) : 0;
  const pointY = active !== null ? yFor(activeHighest) : 0;
  const centreX = Math.min(
    Math.max(pointX, halfWidth + margin),
    Math.max(halfWidth + margin, width - halfWidth - margin),
  );
  const fitsAbove = pointY - tooltipSize.height - margin >= 0;
  const fitsBelow = pointY + tooltipSize.height + margin <= height;
  const placement = fitsAbove ? 'above' : fitsBelow ? 'below' : 'inside';

  return (
    <div className="line-chart" ref={wrapRef}>
      <div className="line-chart-frame" style={{ height }}>
        {width > 0 && (
          <svg
            className="line-chart-plot"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="presentation"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="line-chart-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-area)" />
                <stop offset="100%" stopColor="var(--chart-area-fade)" />
              </linearGradient>
              {/* The plot surface carries a warm champagne wash, a little
                  deeper at the top, so the chart sits on the salon's own
                  palette rather than on a plain rectangle. */}
              <linearGradient id="line-chart-surface-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-surface-top)" />
                <stop offset="100%" stopColor="var(--chart-surface-bottom)" />
              </linearGradient>
            </defs>
            <rect
              className="line-chart-surface"
              x={LINE_PADDING.left}
              y={LINE_PADDING.top}
              width={Math.max(0, plotWidth)}
              height={Math.max(0, plotHeight)}
              rx={6}
              fill="url(#line-chart-surface-fill)"
            />
            {ticks.filter((tick) => tick > 0).map((tick) => (
              <line
                key={tick}
                className="line-chart-gridline"
                x1={LINE_PADDING.left}
                x2={LINE_PADDING.left + plotWidth}
                y1={yFor(tick)}
                y2={yFor(tick)}
              />
            ))}
            <line
              className="line-chart-baseline"
              x1={LINE_PADDING.left}
              x2={LINE_PADDING.left + plotWidth}
              y1={baseline}
              y2={baseline}
            />
            {ticks.map((tick) => (
              <text
                key={`tick-${tick}`}
                className="line-chart-axis-label line-chart-y-label"
                x={LINE_PADDING.left - 8}
                y={yFor(tick) + 4}
                textAnchor="end"
              >
                {tick}
              </text>
            ))}
            {axis.map((point, index) =>
              index % labelStep === 0 || index === axis.length - 1 ? (
                <text
                  key={`label-${point.key}`}
                  className="line-chart-axis-label"
                  x={xFor(index)}
                  y={height - 10}
                  textAnchor="middle"
                >
                  {point.label}
                </text>
              ) : null,
            )}
            <g key={signature} className="line-chart-series">
              {series.map((entry) =>
                area ? (
                  <path
                    key={`area-${entry.key}`}
                    className="line-chart-area"
                    d={monotoneAreaPath(pointsFor(entry), baseline)}
                    fill={series.length === 1 ? 'url(#line-chart-area-fill)' : 'var(--chart-area)'}
                    style={{ '--series-color': `var(${entry.color})` } as CSSProperties}
                  />
                ) : null,
              )}
              {series.map((entry) => (
                <path
                  key={`line-${entry.key}`}
                  className="line-chart-line"
                  d={monotonePath(pointsFor(entry))}
                  style={{ '--series-color': `var(${entry.color})` } as CSSProperties}
                />
              ))}
              {series.map((entry) =>
                axis.map((point, index) => {
                  const value = entry.values[point.key] ?? 0;
                  if (value === 0 && axis.length > 14) return null;
                  return (
                    <g key={`point-${entry.key}-${point.key}`}>
                      {active === index && (
                        <circle
                          className="line-chart-halo"
                          cx={xFor(index)}
                          cy={yFor(value)}
                          r={9}
                          style={{ '--series-color': `var(${entry.color})` } as CSSProperties}
                        />
                      )}
                      {focusIndex === index && (
                        <circle
                          className="line-chart-focus-ring"
                          cx={xFor(index)}
                          cy={yFor(value)}
                          r={8}
                        />
                      )}
                      <circle
                        className={`line-chart-point${active === index ? ' active' : ''}`}
                        cx={xFor(index)}
                        cy={yFor(value)}
                        r={active === index ? 5 : 2.6}
                        style={{ '--series-color': `var(${entry.color})` } as CSSProperties}
                      />
                    </g>
                  );
                }),
              )}
            </g>
          </svg>
        )}

        {/* The hit targets sit over the plot as real buttons, so the chart
            works with a pointer, a keyboard and a finger. A roving tab
            index keeps it to one stop in the tab order. */}
        {width > 0 && (
          <div
            className="line-chart-hit-layer"
            style={{ left: LINE_PADDING.left, width: plotWidth, top: LINE_PADDING.top, height: plotHeight }}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {axis.map((point, index) => {
              const values = series.map((entry) => entry.values[point.key] ?? 0);
              const dayTotal = values.reduce((sum, value) => sum + value, 0);
              const named = series
                .filter((entry) => (entry.values[point.key] ?? 0) > 0)
                .map((entry) => `${entry.label} ${format(entry.values[point.key] ?? 0)}`);
              const description = named.length > 0
                ? `${point.fullLabel}: ${dayTotal} ${dayTotal === 1 ? unit.replace(/s$/, '') : unit}${named.length > 1 ? ` (${named.join(', ')})` : ''}`
                : `${point.fullLabel}: no ${unit}`;
              // The band is centred on its point, so the first and the last
              // would otherwise reach past the edge of the plot. They are
              // pulled back inside, so a focus ring never spills into the
              // gutter beside the chart.
              const band = axis.length > 1 ? dataSpan / (axis.length - 1) : dataSpan;
              const bandLeft = Math.max(0, xFor(index) - band / 2);
              const bandWidth = Math.min(plotWidth - bandLeft, band);
              return (
                <button
                  key={point.key}
                  ref={(element) => { hitRef.current[index] = element; }}
                  type="button"
                  className="line-chart-hit"
                  style={{ left: `${bandLeft}px`, width: `${bandWidth}px` }}
                  tabIndex={active === index ? 0 : -1}
                  aria-label={description}
                  onFocus={() => setFocusIndex(index)}
                  onBlur={() => setFocusIndex((current) => (current === index ? null : current))}
                  onMouseEnter={() => setHoverIndex(index)}
                  /* A tap or a click reveals the point on its own. It does
                     not rely on the browser firing a focus event, which a
                     touch screen may not do at all. */
                  onClick={() => {
                    setHoverIndex(null);
                    setFocusIndex(index);
                    hitRef.current[index]?.focus();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); moveTo(index + 1); }
                    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); moveTo(index - 1); }
                    else if (event.key === 'Home') { event.preventDefault(); moveTo(0); }
                    else if (event.key === 'End') { event.preventDefault(); moveTo(axis.length - 1); }
                    else if (event.key === 'Escape') {
                      setFocusIndex(null);
                      setHoverIndex(null);
                      hitRef.current[index]?.blur();
                    }
                  }}
                />
              );
            })}
          </div>
        )}

        {activePoint && active !== null && (
          <div
            ref={tooltipRef}
            className={`line-chart-tooltip ${placement}`}
            style={{ left: `${centreX}px`, top: `${placement === 'inside' ? margin : pointY}px` }}
            role="status"
          >
            <strong>{activePoint.fullLabel}</strong>
            <span className="line-chart-tooltip-metric">{metricName}</span>
            <ul>
              {series.map((entry) => {
                const value = entry.values[activePoint.key] ?? 0;
                if (value === 0) return null;
                return (
                  <li key={entry.key}>
                    <span className="line-chart-swatch" style={{ background: `var(${entry.color})` }} />
                    <span>{entry.label}</span>
                    <strong>{format(value)}</strong>
                  </li>
                );
              })}
              {series.every((entry) => (entry.values[activePoint.key] ?? 0) === 0) && (
                <li><span>No {unit}</span></li>
              )}
            </ul>
          </div>
        )}
      </div>

      {series.length > 1 && (
        <ul className="line-chart-legend">
          {series.map((entry) => (
            <li key={entry.key}>
              <span className="line-chart-swatch" style={{ background: `var(${entry.color})` }} />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A short note that names where a figure came from.
 *
 * The demo adapter serves browser-local records, so a panel that shows
 * them says so rather than implying a live feed.
 */
export function DataOriginNote({ children }: { children: ReactNode }) {
  return <p className="chart-origin-note">{children}</p>;
}
