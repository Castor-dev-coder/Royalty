// Customer identity marks are ALWAYS initials — this app stores and renders
// no customer photos anywhere. Gold on dark, aria-hidden: the person's name
// is rendered as real text next to the mark (never only inside it).

import { initialsFor } from '../lib/initials.js'

function CustomerInitials({ name, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full border border-[rgba(212,180,92,0.45)] bg-[#1a1815] font-semibold text-[var(--gold)] ${className}`}
    >
      {initialsFor(name)}
    </span>
  )
}

export default CustomerInitials
