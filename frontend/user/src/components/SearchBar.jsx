function SearchBar({ value, onChange, placeholder = 'Search reviews...' }) {
  return (
    <label className="search-bar mx-auto flex min-h-13.5 w-full items-center gap-3 rounded-2xl border px-4 text-(--muted) transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-(--gold-bright) focus-within:shadow-[0_0_0_4px_rgba(212,180,92,0.14)]">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[rgba(212,180,92,0.12)] text-(--gold)" aria-hidden="true">
        <svg
          className="size-4 fill-none stroke-current [stroke-linecap:round] stroke-[1.8]"
          viewBox="0 0 24 24"
        >
          <circle cx="10.8" cy="10.8" r="6.3" />
          <path d="m15.5 15.5 4.3 4.3" />
        </svg>
      </span>
      <span className="sr-only">Search reviews</span>
      <input
        className="search-bar-input min-w-0 w-full border-0 bg-transparent text-base text-(--text) outline-none placeholder:text-(--muted)"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  )
}

export default SearchBar
