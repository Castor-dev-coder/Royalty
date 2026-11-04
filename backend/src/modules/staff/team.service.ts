// Public team listing for "Meet Our Team". Returns ONLY display fields —
// never email, phone, or account ids — and only staff flagged show_on_team.
import { db } from '../../prisma/db.js'

export interface TeamMember {
  id: string
  firstName: string
  lastName: string
  photoUrl: string | null
  position: string | null
  bio: string | null
  specialties: Array<{ id: string; name: string }>
  coveredRoles: string[]
}

export async function listTeam(): Promise<TeamMember[]> {
  const staff = await db.orm.public.Staff.where({ showOnTeam: true }).all()
  const out: TeamMember[] = []
  for (const member of staff) {
    const links = await db.orm.public.StaffCategory.where({ staffId: member.id }).all()
    const specialties: Array<{ id: string; name: string }> = []
    for (const link of links) {
      const category = await db.orm.public.ServiceCategory.where({ id: link.categoryId }).first()
      if (category) specialties.push({ id: String(category.id), name: String(category.name) })
    }
    out.push({
      id: String(member.id),
      firstName: String(member.firstName),
      lastName: String(member.lastName),
      photoUrl: member.photoUrl ? String(member.photoUrl) : null,
      position: member.position ? String(member.position) : null,
      bio: member.bio ? String(member.bio) : null,
      specialties,
      coveredRoles: Array.isArray(member.coveredRoles) ? member.coveredRoles.map(String) : [],
    })
  }
  // Stable display order.
  return out.sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName))
}
