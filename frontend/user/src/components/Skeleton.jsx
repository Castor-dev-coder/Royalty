// Reusable loading skeletons. The blocks are decorative (`aria-hidden`) —
// callers provide one accessible status line (see PageSkeleton.jsx).

function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton-shimmer ${className}`} />
}

// Image-shaped block used while gallery, service, or review photos load.
function SkeletonImage({ className = '' }) {
  return <Skeleton className={`rounded-[4px] ${className}`} />
}

// Matches ServiceCard.jsx: image block, title/price row, body lines, action row.
function ServiceCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="overflow-hidden rounded-[6px] border border-[rgba(212,180,92,0.28)] bg-(--card) max-[680px]:grid max-[680px]:grid-cols-[minmax(105px,0.8fr)_minmax(0,1.2fr)]"
    >
      <Skeleton className="aspect-[4/3] w-full rounded-none max-[680px]:aspect-auto max-[680px]:h-full max-[680px]:min-h-[210px]" />
      <div className="flex min-h-[206px] flex-col gap-3 p-[19px_19px_17px]">
        <div className="flex items-baseline justify-between gap-3">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-9 w-24 rounded-[2px]" />
        </div>
      </div>
    </article>
  )
}

// Matches ReviewCard.jsx: photo strip, avatar/name row, category pill, text.
function ReviewCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="overflow-hidden rounded-2xl border border-(--line) bg-(--review-panel)"
    >
      <div className="grid grid-cols-3 gap-2 border-b border-[rgba(212,180,92,0.2)] p-2.5">
        <Skeleton className="aspect-[4/3] rounded-lg" />
        <Skeleton className="aspect-[4/3] rounded-lg" />
        <Skeleton className="aspect-[4/3] rounded-lg" />
      </div>
      <div className="flex flex-col p-[18px_18px_16px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-3.75 w-24" />
        </div>
        <Skeleton className="mt-4.5 h-6 w-24 rounded-full" />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
    </article>
  )
}

export { Skeleton, SkeletonImage, ServiceCardSkeleton, ReviewCardSkeleton }
export default Skeleton
