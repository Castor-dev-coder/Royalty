import { BadRequestError } from '../../errors/index.js';

export type AppointmentStatus = 'RESERVED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

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
  return new Date(`${value}T00:00:00.000Z`);
}

export function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
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
  appointmentDate: Date,
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

export function canTransitionStatus(current: AppointmentStatus, next: AppointmentStatus): boolean {
  return transitions[current].includes(next);
}