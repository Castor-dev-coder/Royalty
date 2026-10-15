const starOrder = [5, 4, 3, 2, 1]

function RatingSummary({ average, totalReviews, breakdown }) {
  return (
    <div className="rounded-[18px] border border-[var(--line)] bg-[var(--review-panel)] p-[26px_24px_20px] shadow-[0_0_0_1px_rgba(212,180,92,0.08)]">
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-[34px] font-semibold leading-none text-[var(--gold)]">
            {average}
            <div className="text-[18px] text-[var(--gold)]">★</div>
          </div>
          <div className="mt-2 text-[12px] uppercase tracking-[0.08em] text-[var(--muted)]">
            Based on {totalReviews.toLocaleString()} reviews
          </div>
        </div>
      </div>

      <div className="mt-[18px] space-y-[8px]">
        {starOrder.map((star) => {
          const percent = breakdown[star] ?? 0

          return (
            <div className="grid grid-cols-[78px_1fr_42px] items-center gap-3 text-[12px] text-[#d8d1c5]" key={star}>
              <span>{star} Stars</span>
              <div className="h-[8px] overflow-hidden rounded-full bg-[#25211d]">
                <div
                  className="h-full rounded-full bg-[var(--gold)]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-right text-[var(--muted)]">{percent}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default RatingSummary
