const variantIcons = {
  success: (
    <path d="M20 6 9 17l-5-5" />
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.8 19h18.4L12 3Z" />
      <path d="M12 9.5v4.2M12 16.6h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
}

const variantLabel = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Information',
}

function Toast({ variant, message, onClose, onPause, onResume }) {
  return (
    <li>
      <div
        className="toast-card flex items-start gap-3"
        data-variant={variant}
        onBlur={onResume}
        onFocus={onPause}
        onMouseEnter={onPause}
        onMouseLeave={onResume}
        role={variant === 'error' ? 'alert' : 'status'}
      >
        <svg
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
          viewBox="0 0 24 24"
        >
          {variantIcons[variant] ?? variantIcons.info}
        </svg>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[10px] font-semibold tracking-[0.18em] text-[var(--toast-accent)] uppercase">
            {variantLabel[variant] ?? variantLabel.info}
          </p>
          <p className="m-0 mt-1 text-[13px] leading-[1.55] text-(--text)">{message}</p>
        </div>
        <button
          aria-label="Dismiss notification"
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-(--muted) transition-colors hover:bg-[rgba(212,180,92,0.12)] hover:text-(--gold)"
          onClick={onClose}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-width:1.8]"
            viewBox="0 0 24 24"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </li>
  )
}

export default Toast
