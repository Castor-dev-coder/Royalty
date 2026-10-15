function CategoryFilter({ categories, activeCategory, onSelect }) {
  return (
    <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [&>button:first-child]:ml-auto [&>button:last-child]:mr-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {categories.map((category) => {
        const isActive = activeCategory === category

        return (
          <button
            aria-pressed={isActive}
            className={`shrink-0 cursor-pointer rounded-full border px-[14px] py-[8px] text-[12px] font-medium tracking-[0.05em] uppercase transition-all duration-200 ${
              isActive
                ? 'border-[var(--gold)] bg-[var(--gold)] text-[#111111] shadow-[0_0_0_1px_rgba(212,180,92,0.28)]'
                : 'border-[rgba(212,180,92,0.7)] bg-transparent text-[#e7e1d5] hover:bg-[rgba(212,180,92,0.08)]'
            }`}
            key={category}
            onClick={() => onSelect(category)}
            type="button"
          >
            {category}
          </button>
        )
      })}
    </div>
  )
}

export default CategoryFilter