// Shared demo appointment model. The seed records are the same three the
// Appointments page has always shown; owner-scoped patches in localStorage
// hold local/demo changes (reschedules, cancellations) made by the signed-in
// mock customer. Derived helpers keep every surface (Appointments page and
// the Services welcome panel) reading the same records.

export const seedAppointments = [
  { id: 'apt-1', date: '2026-10-10', time: '2:30 PM', service: 'Hair Coloring', stylist: 'Anna Reyes', price: '₱2,500', status: 'CONFIRMED' },
  { id: 'apt-2', date: '2026-10-24', time: '11:00 AM', service: 'Classic Haircut', stylist: 'Anna Reyes', price: '₱800', status: 'COMPLETED' },
  { id: 'apt-3', date: '2026-11-07', time: '3:00 PM', service: 'Hair Treatment', stylist: 'Any available stylist', price: '₱1,200', status: 'PENDING' },
]

export const TIME_OPTIONS = ['10:00 AM', '1:00 PM', '2:30 PM', '4:00 PM']
export const STORAGE_KEY = 'royalty-appointments'

export function loadPatches() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

/** The signed-in demo customer's records: seed + their own local patches. */
export function getMyAppointments(user) {
  const patches = loadPatches()
  return seedAppointments.map((appointment) => {
    const patch = user && patches.find((p) => p.id === appointment.id && p.owner === user.email)
    return patch ? { ...appointment, ...patch.fields } : appointment
  })
}

/**
 * The earliest genuinely upcoming appointment (changeable status, date today
 * or later). Returns null when nothing is upcoming — callers must not invent
 * a record to fill the slot.
 */
export function getNextAppointment(user) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return getMyAppointments(user)
    .filter((a) => ['CONFIRMED', 'PENDING'].includes(a.status) && new Date(`${a.date}T00:00:00`) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null
}

export function formatAppointmentDate(iso, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', options)
}
