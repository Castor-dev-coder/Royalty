const DATE_ONLY_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:$|T)/;
const TIME_ONLY_PATTERN = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

export function isoWeekdayToPostgres(dayOfWeek: number): number {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    throw new RangeError('ISO weekday must be between 1 and 7');
  }
  return dayOfWeek % 7;
}

export function postgresWeekdayToIso(dayOfWeek: number): number {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new RangeError('PostgreSQL weekday must be between 0 and 6');
  }
  return dayOfWeek === 0 ? 7 : dayOfWeek;
}

export function normalizeDateOnly(value: Date | string): string {
  const date = value instanceof Date ? dateFromDateValue(value) : DATE_ONLY_PATTERN.exec(value)?.[1];
  if (!date || !isValidDateOnly(date)) throw new RangeError('Value is not a valid date-only value');
  return date;
}

export function dateOnlyToUtcDate(value: Date | string): Date {
  return new Date(`${normalizeDateOnly(value)}T00:00:00.000Z`);
}

export function dateTimeInputToDateOnly(value: string): Date {
  return dateOnlyToUtcDate(value);
}

export function normalizeTimeOnly(value: Date | string): string {
  if (value instanceof Date) {
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }

  const match = TIME_ONLY_PATTERN.exec(value);
  if (!match) throw new RangeError('Value is not a valid time-only value');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new RangeError('Value is not a valid time-only value');
  return `${match[1]}:${match[2]}`;
}

function isValidDateOnly(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateFromDateValue(value: Date): string {
  const utcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
  if (utcMidnight) return value.toISOString().slice(0, 10);

  const localMidnight = value.getHours() === 0 && value.getMinutes() === 0 &&
    value.getSeconds() === 0 && value.getMilliseconds() === 0;
  if (localMidnight) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  return value.toISOString().slice(0, 10);
}