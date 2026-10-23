function pageWindow(page, pageCount) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }
  const start = Math.min(Math.max(page - 2, 1), pageCount - 4)
  return Array.from({ length: 5 }, (_, index) => start + index)
}

// Client-side list pagination: Previous/Next plus a numbered page window.
// Collapses to a compact "Page X of Y" control on very narrow screens.
function Pagination({ page, pageCount, onChange, totalItems }) {
  if (pageCount <= 1) return null

  const pages = pageWindow(page, pageCount)

  return (
    <nav aria-label="Pagination" className="mt-9 flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <button
          aria-label="Previous page"
          className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[3px] border border-[rgba(212,180,92,0.5)] bg-transparent px-3.5 text-[13px] font-semibold tracking-[0.12em] text-(--text) uppercase transition-[background-color,color,border-color] duration-[180ms] enabled:hover:border-[var(--gold)] enabled:hover:text-(--gold) disabled:cursor-default disabled:opacity-[0.35]"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          type="button"
        >
          <svg aria-hidden="true" className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className="max-[480px]:hidden">Prev</span>
        </button>

        <ol className="m-0 flex list-none items-center gap-1.5 p-0 max-[480px]:hidden">
          {pages.map((pageNumber) => (
            <li key={pageNumber}>
              <button
                aria-current={pageNumber === page ? 'page' : undefined}
                aria-label={`Page ${pageNumber}${pageNumber === page ? ', current page' : ''}`}
                className={`grid size-[40px] cursor-pointer place-items-center rounded-[3px] border text-[12px] font-semibold transition-[background-color,color,border-color] duration-[180ms] ${
                  pageNumber === page
                    ? 'border-[var(--gold)] bg-[var(--gold)] text-[#111]'
                    : 'border-[rgba(212,180,92,0.35)] bg-transparent text-(--muted) hover:border-[var(--gold)] hover:text-(--gold)'
                }`}
                onClick={() => onChange(pageNumber)}
                type="button"
              >
                {pageNumber}
              </button>
            </li>
          ))}
        </ol>

        <button
          aria-label="Next page"
          className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[3px] border border-[rgba(212,180,92,0.5)] bg-transparent px-3.5 text-[13px] font-semibold tracking-[0.12em] text-(--text) uppercase transition-[background-color,color,border-color] duration-[180ms] enabled:hover:border-[var(--gold)] enabled:hover:text-(--gold) disabled:cursor-default disabled:opacity-[0.35]"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          type="button"
        >
          <span className="max-[480px]:hidden">Next</span>
          <svg aria-hidden="true" className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]" viewBox="0 0 24 24">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <p aria-live="polite" className="m-0 text-[13px] tracking-[0.14em] text-(--muted) uppercase">
        Page {page} of {pageCount}
        {typeof totalItems === 'number' ? ` · ${totalItems} total` : ''}
      </p>
    </nav>
  )
}

export default Pagination
