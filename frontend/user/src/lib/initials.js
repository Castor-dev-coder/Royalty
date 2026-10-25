// Customer identity marks are ALWAYS initials — derived from the name text,
// never a photo. Shared by CustomerInitials and review-photo alt text so the
// two conventions cannot drift apart.

export function initialsFor(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase() || '?'
}
