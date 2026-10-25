import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  candidateSlots,
  hoursForDate,
  manilaNow,
  slotProblem,
  validSlots,
  weekdayName,
} from './hours.js'

// Mon–Sat 09:00–18:00, Sunday closed (API encoding 1..7).
const ROWS = [
  ...[1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '18:00',
    isOpen: true,
  })),
  { dayOfWeek: 7, openTime: null, closeTime: null, isOpen: false },
]

// A Monday and the Sunday before it.
const MONDAY = '2026-11-02'
const SUNDAY = '2026-11-01'

beforeEach(() => {
  // 2026-10-25T01:16:00Z = 2026-10-25 09:16 in Asia/Manila.
  vi.setSystemTime(new Date('2026-10-25T01:16:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('manilaNow', () => {
  it('reports the salon clock, not the browser clock', () => {
    const now = manilaNow()
    expect(now.date).toBe('2026-10-25')
    expect(now.secondsOfDay).toBe(9 * 3600 + 16 * 60)
    expect(weekdayName(MONDAY)).toBe('Monday')
    expect(weekdayName(SUNDAY)).toBe('Sunday')
  })
})

describe('hoursForDate', () => {
  it('accepts both Sunday encodings (0 and 7) and matches by weekday', () => {
    expect(hoursForDate(ROWS, MONDAY)?.dayOfWeek).toBe(1)
    expect(hoursForDate(ROWS, SUNDAY)?.dayOfWeek).toBe(7)
    expect(hoursForDate([{ dayOfWeek: 0, isOpen: true, openTime: '10:00', closeTime: '16:00' }], SUNDAY)?.dayOfWeek).toBe(0)
    expect(hoursForDate([], MONDAY)).toBeNull()
  })
})

describe('candidateSlots / validSlots', () => {
  it('steps every 30 minutes from open to close', () => {
    expect(candidateSlots(ROWS[0])[0]).toBe('09:00')
    expect(candidateSlots(ROWS[0]).at(-1)).toBe('18:00')
    expect(candidateSlots(ROWS[0])).toHaveLength(19)
    expect(candidateSlots(ROWS[6])).toEqual([])
  })

  it('keeps only slots where the whole appointment fits before closing', () => {
    const slots = validSlots({ rows: ROWS, date: MONDAY, durationMinutes: 90 })
    expect(slots.at(-1)).toBe('16:30') // 16:30 + 90min = 18:00 close
    expect(slots).not.toContain('17:00')
  })

  it('excludes past starts on today (Asia/Manila) and past days', () => {
    // Now is 09:16 Manila on 2026-10-25 (a Sunday — use Monday's rows via
    // the same weekday math: 2026-10-26 is the next Monday).
    const today = '2026-10-26' // Monday next to the frozen clock
    vi.setSystemTime(new Date('2026-10-25T16:30:00Z')) // 2026-10-26 00:30 Manila
    const slots = validSlots({ rows: ROWS, date: today, durationMinutes: 60 })
    expect(slots[0]).toBe('09:00')
    vi.setSystemTime(new Date('2026-10-26T05:00:00Z')) // 2026-10-26 13:00 Manila
    const later = validSlots({ rows: ROWS, date: today, durationMinutes: 60 })
    expect(later).not.toContain('13:00') // starts at/behind "now" are gone
    expect(later[0]).toBe('13:30')
    expect(validSlots({ rows: ROWS, date: '2026-10-25', durationMinutes: 60 })).toEqual([])
  })

  it('returns nothing for a closed day', () => {
    expect(validSlots({ rows: ROWS, date: SUNDAY, durationMinutes: 60 })).toEqual([])
  })
})

describe('slotProblem', () => {
  it('spells out why a slot cannot be booked (server phrasing)', () => {
    expect(slotProblem({ rows: ROWS, date: SUNDAY, time: '10:00', durationMinutes: 60 })).toBe(
      'The salon is closed on Sunday.',
    )
    expect(slotProblem({ rows: ROWS, date: MONDAY, time: '08:30', durationMinutes: 60 })).toBe(
      'The salon opens at 09:00 on Monday.',
    )
    expect(slotProblem({ rows: ROWS, date: MONDAY, time: '17:30', durationMinutes: 60 })).toBe(
      'The appointment must end by 18:00 on Monday.',
    )
    expect(slotProblem({ rows: ROWS, date: '2026-10-20', time: '10:00', durationMinutes: 60 })).toBe(
      'Appointment date and time must be in the future',
    )
  })

  it('is null for a bookable slot and when hours were never loaded', () => {
    expect(slotProblem({ rows: ROWS, date: MONDAY, time: '14:00', durationMinutes: 60 })).toBeNull()
    expect(slotProblem({ rows: null, date: MONDAY, time: '14:00', durationMinutes: 60 })).toBeNull()
  })
})
