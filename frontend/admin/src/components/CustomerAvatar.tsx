/**
 * The customer identity mark used wherever a customer's picture would sit.
 *
 * A customer has no photo in this system, so every customer slot renders
 * initials instead: gold text on a dark disc, hidden from assistive
 * technology because the person's name is always real text right next to
 * it. Staff photos are a separate matter and are rendered unchanged.
 */

/**
 * The initials of a person's name: first and last name's first letters.
 * A single name gives one letter; an empty name gives a neutral mark.
 */
export function customerInitials(name: string): string {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return '?';
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * The customer avatar: initials on the customer mark.
 *
 * Decorative only — always render the customer's name as real text beside
 * it. The element is `aria-hidden`, so the name is the accessible identity.
 */
export function CustomerAvatar({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`customer-avatar ${className}`.trim()} aria-hidden="true">
      {customerInitials(name)}
    </span>
  );
}
