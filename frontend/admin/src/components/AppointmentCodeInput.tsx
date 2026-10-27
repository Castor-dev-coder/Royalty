import { useId } from 'react';

/**
 * Appointment code entry with a fixed, non-editable "APT-" prefix: staff type
 * only the rest. New codes are five digits (APT-12345); legacy codes are
 * APT-<UUID> with hyphens, so letters, digits and hyphens are accepted,
 * uppercased as they type; spaces are trimmed; a pasted "APT-…" is never
 * double-prefixed. onChange receives the FULL code — "APT-" plus the typed
 * part — and the server still validates the full value.
 */
export function AppointmentCodeInput({
  label,
  value,
  onChange,
  placeholder = '12345',
  describedBy,
  inputClassName = 'modal-input',
}: {
  /** Visible field label (required). */
  label: string;
  /** Full code value ('APT-…' or '' when empty). */
  value: string;
  /** Receives the full code: 'APT-' plus the typed part. */
  onChange: (fullCode: string) => void;
  placeholder?: string;
  describedBy?: string;
  inputClassName?: string;
}) {
  const inputId = useId();
  const typed = value.toUpperCase().startsWith('APT-') ? value.slice(4) : value;

  function handle(next: string) {
    // Letters, digits and hyphens only; uppercase; no spaces.
    let cleaned = next.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    // A pasted value that already starts with APT- must not double the prefix.
    if (cleaned.startsWith('APT-')) cleaned = cleaned.slice(4);
    else if (cleaned.startsWith('APT')) cleaned = cleaned.slice(3);
    onChange(cleaned ? `APT-${cleaned}` : '');
  }

  return (
    <label className="field-label" htmlFor={inputId}>
      {label}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          width: '100%',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--line, rgba(212, 180, 92, 0.35))',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 10px',
            background: 'rgba(212, 180, 92, 0.14)',
            color: 'var(--gold, #d4b45c)',
            font: 'inherit',
            letterSpacing: '0.08em',
            userSelect: 'none',
          }}
        >
          APT-
        </span>
        <input
          id={inputId}
          className={inputClassName}
          style={{ border: 'none', flex: 1, minWidth: 0 }}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          placeholder={placeholder}
          aria-describedby={describedBy}
          onChange={(event) => handle(event.target.value)}
        />
      </span>
    </label>
  );
}
