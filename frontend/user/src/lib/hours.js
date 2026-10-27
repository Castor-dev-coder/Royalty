// Shop hours and bookable-slot arithmetic for the customer booking flow.
// All "now"/"today" answers are computed in Asia/Manila — the salon's own
// clock — so slot validity never depends on where the browser happens to be.

const MANILA_TZ = 'Asia/Manila'

/** Start times are generated on this step (minutes). */
export const SLOT_STEP_MINUTES = 30

/** Current calendar date ('YYYY-MM-DD') and seconds-of-day in Asia/Manila. */
export function manilaNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    secondsOfDay: (Number(get('hour')) % 24) * 3600 + Number(get('minute')) * 60 + Number(get('second')),
  }
}

export function manilaTodayIso() {
  return manilaNow().date
}

/**
 * Last day ('YYYY-MM-DD') of the current Asia/Manila calendar month — the
 * upper bound of the current-month-only booking policy. Computed from the
 * Manila date itself, so the boundary follows the salon's calendar no matter
 * where the browser is.
 */
export function manilaMonthEndIso(date = new Date()) {
  const monthKey = manilaNow(date).date.slice(0, 7)
  const [year, month] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${monthKey}-${String(lastDay).padStart(2, '0')}`
}

/** 'Monday', 'Sunday', … for a calendar date string ('YYYY-MM-DD'). */
export function weekdayName(date) {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  })
}

/** True for a real calendar date string the picker can reason about. */
export function isBookableDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? '')) && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())
}

/** 0=Sunday..6=Saturday for a calendar date string. */
export function weekdayIndex(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/**
 * The hours row governing `date`, or null when that day has no row (treated
 * as closed). The API encodes Monday..Sunday as 1..7 while the documented
 * contract says 0=Sunday..6=Saturday; Sunday is the only day the two
 * conventions disagree on, so accept either encoding for it.
 */
export function hoursForDate(rows, date) {
  const day = weekdayIndex(date)
  const accepted = day === 0 ? [0, 7] : [day]
  return (rows ?? []).find((row) => accepted.includes(Number(row?.dayOfWeek))) ?? null
}

export function toMinutes(hhmm) {
  const [hours, minutes] = String(hhmm ?? '').split(':').map(Number)
  return hours * 60 + minutes
}

export function formatMinutes(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Every candidate start (open → close inclusive, on the step), as 'HH:MM'. */
export function candidateSlots(row) {
  if (!row?.isOpen || !row.openTime || !row.closeTime) return []
  const open = toMinutes(row.openTime)
  const close = toMinutes(row.closeTime)
  const slots = []
  for (let start = open; start <= close; start += SLOT_STEP_MINUTES) {
    slots.push(formatMinutes(start))
  }
  return slots
}

/**
 * The starts a customer may actually book for `date`: the whole appointment
 * (durationMinutes) must fit inside opening hours and must lie in the future
 * (Asia/Manila). Closed days yield [].
 */
export function validSlots({ rows, date, durationMinutes }) {
  const row = hoursForDate(rows, date)
  if (!row || !row.isOpen) return []
  const open = toMinutes(row.openTime)
  const close = toMinutes(row.closeTime)
  const now = manilaNow()
  return candidateSlots(row).filter((slot) => {
    const start = toMinutes(slot)
    if (start < open) return false
    if (start + Number(durationMinutes || 0) > close) return false
    if (date < now.date) return false
    if (date === now.date && start * 60 <= now.secondsOfDay) return false
    return true
  })
}

/**
 * Why a chosen slot cannot be booked — the server's own phrasing, so the
 * pre-submit check and the API agree. null when the slot is bookable; null
 * also when the hours were never loaded (the server stays the authority).
 */
export function slotProblem({ rows, date, time, durationMinutes }) {
  if (!rows || !isBookableDate(date) || !time) return null
  const weekday = weekdayName(date)
  const row = hoursForDate(rows, date)
  if (!row || !row.isOpen) return `The salon is closed on ${weekday}.`
  const open = toMinutes(row.openTime)
  const close = toMinutes(row.closeTime)
  const start = toMinutes(time)
  if (start < open) return `The salon opens at ${row.openTime} on ${weekday}.`
  if (start + Number(durationMinutes || 0) > close) return `The appointment must end by ${row.closeTime} on ${weekday}.`
  const now = manilaNow()
  if (date < now.date || (date === now.date && start * 60 <= now.secondsOfDay)) {
    return 'Appointment date and time must be in the future'
  }
  return null
}
