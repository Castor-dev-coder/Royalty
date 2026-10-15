function SearchBar({ value, onChange, placeholder = 'Search reviews...' }) {
  return (
    <label className="mx-auto flex h-[42px] w-full items-center gap-[10px] rounded-full border border-[var(--line)] bg-[rgba(17,17,17,0.8)] px-[14px] text-[var(--muted)] transition-colors duration-200 focus-within:border-[var(--gold-bright)] focus-within:shadow-[0_0_0_2px_rgba(212,180,92,0.18)]">
      <span className="flex size-4 shrink-0" aria-hidden="true">
        <svg
          className="w-full fill-none stroke-current [stroke-linecap:round] [stroke-width:1.6]"
          viewBox="0 0 24 24"
        >
          <circle cx="10.8" cy="10.8" r="6.3" />
          <path d="m15.5 15.5 4.3 4.3" />
        </svg>
      </span>
      <span className="sr-only">Search reviews</span>
      <input
        className="w-full border-0 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[#858077]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  )
}

export default SearchBar
