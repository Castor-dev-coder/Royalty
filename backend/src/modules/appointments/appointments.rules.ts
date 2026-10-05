import { BadRequestError } from '../../errors/index.js';
import { dateOnlyToUtcDate, normalizeDateOnly } from '../../utils/date-time.js';

export type AppointmentStatus = 'RESERVED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface AvailableStartWindow {
  startTime: string;
  latestStartTime: string;
}

const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  RESERVED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function localDateAndTime(now: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function dateOnly(value: string): Date {
  return dateOnlyToUtcDate(value);
}

export function dateString(value: Date | string): string {
  return normalizeDateOnly(value);
}

export function isoDayOfWeek(value: string): number {
  const day = dateOnly(value).getUTCDay();
  return day === 0 ? 7 : day;
}

export function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function calculateEndTime(startTime: string, durations: number[]): string {
  const endMinutes = toMinutes(startTime) + durations.reduce((sum, duration) => sum + duration, 0);
  if (endMinutes >= 24 * 60) throw new BadRequestError('Appointment cannot extend past midnight');
  return `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
}

export function buildAvailableStartWindows(
  scheduleWindows: Array<{ startTime: string; endTime: string }>,
  bookedWindows: Array<{ startTime: string; endTime: string }>,
  durationMinutes: number
): AvailableStartWindow[] {
  if (durationMinutes <= 0) return [];

  const freeWindows = scheduleWindows.flatMap((schedule) => {
    let segments = [{ start: toMinutes(schedule.startTime), end: toMinutes(schedule.endTime) }];

    for (const booking of bookedWindows) {
      const bookingStart = toMinutes(booking.startTime);
      const bookingEnd = toMinutes(booking.endTime);
      segments = segments.flatMap((segment) => {
        if (bookingStart >= segment.end || bookingEnd <= segment.start) return [segment];
        const remaining: typeof segments = [];
        if (bookingStart > segment.start) remaining.push({ start: segment.start, end: bookingStart });
        if (bookingEnd < segment.end) remaining.push({ start: bookingEnd, end: segment.end });
        return remaining;
      });
    }

    return segments
      .filter((segment) => segment.end - segment.start >= durationMinutes)
      .map((segment) => ({ start: segment.start, latest: segment.end - durationMinutes }));
  }).sort((left, right) => left.start - right.start);

  const result: Array<{ start: number; latest: number }> = [];
  for (const window of freeWindows) {
    const previous = result[result.length - 1];
    if (previous && window.start <= previous.latest + 1) {
      previous.latest = Math.max(previous.latest, window.latest);
    } else {
      result.push({ ...window });
    }
  }

  return result.map(({ start, latest }) => ({
    startTime: minutesToTime(start),
    latestStartTime: minutesToTime(latest),
  }));
}

export function incrementTime(time: string, minutes: number): string | null {
  const next = toMinutes(time) + minutes;
  if (next < 0 || next >= 24 * 60) return null;
  return minutesToTime(next);
}

export function sumDecimalStrings(values: string[]): string {
  const parts = values.map((value) => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) throw new BadRequestError('A service price has an unsupported numeric format');
    return { whole: match[1], fraction: match[2] ?? '' };
  });
  const scale = Math.max(0, ...parts.map((part) => part.fraction.length));
  const total = parts.reduce((sum, part) => {
    const scaled = `${part.whole}${part.fraction.padEnd(scale, '0')}`;
    return sum + BigInt(scaled);
  }, 0n);
  if (scale === 0) return total.toString();

  const digits = total.toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function hasAppointmentTimePassed(
  appointmentDate: Date | string,
  appointmentTime: string,
  now: Date,
  timeZone: string
): boolean {
  const localNow = localDateAndTime(now, timeZone);
  const date = dateString(appointmentDate);
  return date < localNow.date || (date === localNow.date && appointmentTime <= localNow.time);
}

export function timeRangesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  return toMinutes(start1) < toMinutes(end2) && toMinutes(start2) < toMinutes(end1);
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function canTransitionStatus(current: AppointmentStatus, next: AppointmentStatus): boolean {
  return transitions[current].includes(next);
}