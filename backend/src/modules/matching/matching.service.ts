// Rule-based staff matching for booking (no AI). A candidate must be an
// active staff member whose specialty categories cover every category the
// selected services need, and who is free for the whole slot. Ranking:
//   1. average STAFF review rating (neutral 3.0 when fewer than 3 ratings)
//   2. fewer bookings that day
//   3. stable id (lexicographic) as the final tiebreak
// When nobody covers every category the response is PARTIAL: every candidate
// is labeled "covers X of Y" and recommended stays null (never auto-select).
import { db } from '../../prisma/db.js'
import { BadRequestError } from '../../errors/index.js'
import { toPlainDate } from '../../utils/date-time.js'

export const NEUTRAL_RATING = 3.0

export interface MatchStaffEntry {
  id: string
  firstName: string
  lastName: string
  photoUrl: string | null
  position: string | null
  primaryRole: string
  avgStaffRating: number | null
  bookingsToday: number
  coversCategories: number
  coversAll: boolean
}

export interface MatchingResult {
  recommended: MatchStaffEntry | null
  reason: string
  alternatives: MatchStaffEntry[]
  partial: boolean
  covers: number
  needed: number
}

interface TimeMath {
  minutes: number
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map((part) => Number(part))
  return h * 60 + m
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

async function staffRating(staffId: string): Promise<{ avg: number | null; count: number }> {
  // STAFF category ratings on this staff's COMPLETED/CONFIRMED appointments.
  const appointments = await db.orm.public.Appointment.where({ staffId }).all()
  const scores: number[] = []
  for (const appointment of appointments) {
    const review = await db.orm.public.Review.where({ appointmentId: appointment.id }).first()
    if (!review) continue
    const ratings = await db.orm.public.ReviewRating.where({ reviewId: review.id, category: 'STAFF' }).all()
    for (const rating of ratings) scores.push(Number(rating.rating))
  }
  if (scores.length === 0) return { avg: null, count: 0 }
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length
  return { avg: Number(avg.toFixed(1)), count: scores.length }
}

export async function matchStaff(input: {
  serviceIds: string[]
  date: string
  startTime: string
}): Promise<MatchingResult> {
  const services: Array<{ id: string; categoryId: string; durationMinutes: number }> = []
  for (const id of input.serviceIds) {
    const service = await db.orm.public.Service.where({ id }).first()
    if (!service) throw new BadRequestError(`Unknown service: ${id}`)
    services.push({ id: String(service.id), categoryId: String(service.categoryId), durationMinutes: Number(service.durationMinutes) })
  }
  if (services.length === 0) throw new BadRequestError('Select at least one service.')

  const neededCategories = [...new Set(services.map((service) => service.categoryId))]
  const totalMinutes: TimeMath = {
    minutes: services.reduce((sum, service) => sum + service.durationMinutes, 0),
  }
  const slotStart = toMinutes(input.startTime)
  const slotEnd = slotStart + totalMinutes.minutes

  const allStaff = await db.orm.public.Staff.all()
  const entries: MatchStaffEntry[] = []

  for (const member of allStaff) {
    const account = await db.orm.public.Account.where({ id: member.accountId }).first()
    if (!account || account.status !== 'ACTIVE' || account.isSystem) continue
    if (String(member.workStatus) === 'UNAVAILABLE') continue

    const links = await db.orm.public.StaffCategory.where({ staffId: member.id }).all()
    const covered = links.map((link) => String(link.categoryId))
    const coversCategories = neededCategories.filter((categoryId) => covered.includes(categoryId)).length

    // Free at the slot: no RESERVED/CONFIRMED appointment may overlap.
    const dayAppointments = await db.orm.public.Appointment.where({ staffId: member.id, appointmentDate: toPlainDate(input.date) }).all()
    const busy = dayAppointments.some((appointment) => {
      const status = String(appointment.status)
      if (status !== 'RESERVED' && status !== 'CONFIRMED') return false
      return overlaps(slotStart, slotEnd, toMinutes(String(appointment.startTime)), toMinutes(String(appointment.endTime)))
    })
    if (busy) continue

    const rating = await staffRating(String(member.id))
    entries.push({
      id: String(member.id),
      firstName: String(member.firstName),
      lastName: String(member.lastName),
      photoUrl: member.photoUrl ? String(member.photoUrl) : null,
      position: member.position ? String(member.position) : null,
      primaryRole: String(member.primaryRole),
      // Fewer than 3 staff ratings counts as neutral: surface null to clients
      // and rank at NEUTRAL_RATING.
      avgStaffRating: rating.count >= 3 ? rating.avg : null,
      bookingsToday: dayAppointments.length,
      coversCategories,
      coversAll: coversCategories === neededCategories.length,
    })
  }

  const rank = (entry: MatchStaffEntry): [number, number, string] => [
    -(entry.avgStaffRating ?? NEUTRAL_RATING),
    entry.bookingsToday,
    entry.id,
  ]
  const byRank = (a: MatchStaffEntry, b: MatchStaffEntry): number => {
    const [ra, ba, ia] = rank(a)
    const [rb, bb, ib] = rank(b)
    return ra - rb || ba - bb || ia.localeCompare(ib)
  }

  const full = entries.filter((entry) => entry.coversAll).sort(byRank)
  const partial = entries.filter((entry) => !entry.coversAll).sort(byRank)
  const needed = neededCategories.length

  if (full.length > 0) {
    const recommended = full[0]
    const ratingPart = recommended.avgStaffRating === null ? 'new stylist' : `staff rating ${recommended.avgStaffRating}`
    const bookingWord = recommended.bookingsToday === 1 ? 'booking' : 'bookings'
    return {
      recommended,
      reason: `Covers all ${needed} ${needed === 1 ? 'category' : 'categories'} · ${ratingPart} · ${recommended.bookingsToday} ${bookingWord} that day`,
      alternatives: [...full.slice(1), ...partial],
      partial: false,
      covers: needed,
      needed,
    }
  }

  // Nobody covers everything: partial matches, never auto-select.
  return {
    recommended: null,
    reason: `No stylist covers every category (${needed} needed) — choose one to see coverage.`,
    alternatives: partial,
    partial: true,
    covers: 0,
    needed,
  }
}
