// Reusable empty state with a replaceable illustration. The image is loaded
// from the public directory by stable path (see
// public/images/empty-states/ASSET-INDEX.md) — swap the file, keep the name,
// and the component picks up the new artwork without code changes.

function EmptyState({ image, title, message, actionLabel, onAction, className = '' }) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      {image && (
        <img
          alt=""
          aria-hidden="true"
          className="h-auto w-[clamp(116px,20vw,168px)] select-none"
          src={image}
        />
      )}
      <h3 className="m-0 mt-6 font-(--serif) text-[22px] leading-tight font-medium text-(--text)">
        {title}
      </h3>
      {message && (
        <p className="m-0 mt-2.5 max-w-[420px] text-sm leading-[1.7] text-(--muted)">
          {message}
        </p>
      )}
      {actionLabel && (
        <button
          className="btn-pill type-section-button mt-6 inline-flex min-h-[42px] cursor-pointer items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.2rem] py-[0.65rem] text-[#111] hover:bg-[var(--gold-bright)] hover:text-[#111]"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export default EmptyState
