type IconProps = {
  className?: string;
};

/**
 * Inline stroke icons drawn for this product's navigation.
 * Purpose: the previous navigation used unrelated Unicode glyphs that read as
 * placeholder characters rather than as section markers. These share one
 * 24x24 grid, one stroke weight and one corner style so the sidebar reads as
 * a single set.
 */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function DashboardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.6" />
    </svg>
  );
}

export function AccountsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.4 20c0-3.1 2.5-5.2 5.6-5.2s5.6 2.1 5.6 5.2" />
      <path d="M16.2 5.4a3.2 3.2 0 0 1 0 5.9" />
      <path d="M18 14.6c1.7.7 2.8 2.3 2.8 4.4" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2.4" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
      <path d="M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2" />
    </svg>
  );
}

export function PaymentsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.4" />
      <path d="M2.5 10h19" />
      <path d="M6.5 14.5h3" />
    </svg>
  );
}

export function StaffIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M20 4L8.6 15.4" />
      <path d="M14.5 14.5L19.4 19.4" />
      <path d="M3.4 6h3.2M3.4 18h3.2" />
    </svg>
  );
}

export function ServicesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7.5h16M4 12h16M4 16.5h10" />
      <circle cx="18.5" cy="16.5" r="2.5" />
    </svg>
  );
}

export function AttendanceIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20.5c0-3.7 3.2-6.2 7.2-6.2s7.2 2.5 7.2 6.2" />
    </svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z" />
    </svg>
  );
}

export function SystemIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.8" y="4" width="18.4" height="12.5" rx="2" />
      <path d="M8.5 20h7" />
      <path d="M12 16.5V20" />
    </svg>
  );
}
