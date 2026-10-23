import { ServiceCardSkeleton, ReviewCardSkeleton, Skeleton } from './Skeleton.jsx'

// Page-shaped loading placeholders shown while a lazily loaded route chunk
// arrives. The navigation and footer stay mounted (see AppShell.jsx), so only
// the content area swaps in. Every variant matches the real page composition.

function SkeletonStatus({ label }) {
  return (
    <span aria-busy="true" className="sr-only" role="status">
      {label}
    </span>
  )
}

function ServicesPageSkeleton() {
  return (
    <div className="min-h-[calc(100vh-76px)] bg-black">
      <SkeletonStatus label="Loading services" />
      <div
        aria-hidden="true"
        className="mx-auto w-[min(100%-48px,1180px)] py-[34px] pb-20 max-[600px]:w-[min(100%-36px,1180px)]"
      >
        <Skeleton className="mx-auto h-13.5 w-full max-w-[560px] rounded-2xl" />
        <div className="mx-auto my-[18px] mb-[42px] flex justify-center gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-[22px] max-[900px]:grid-cols-2 max-[680px]:grid-cols-1 max-[680px]:gap-[17px]">
          {Array.from({ length: 6 }, (_, index) => (
            <ServiceCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ReviewsPageSkeleton() {
  return (
    <div className="min-h-[calc(100vh-76px)] bg-black">
      <SkeletonStatus label="Loading reviews" />
      <div
        aria-hidden="true"
        className="mx-auto w-[min(100%-48px,1180px)] py-[42px] pb-20 max-[600px]:w-[min(100%-36px,1180px)]"
      >
        <Skeleton className="mx-auto h-13.5 w-full max-w-[560px] rounded-2xl" />
        <div className="mx-auto my-[18px] mb-[42px] flex justify-center gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="grid gap-[16px] md:grid-cols-[1.2fr_0.8fr]">
          <Skeleton className="h-52 rounded-[18px]" />
          <Skeleton className="h-52 rounded-[18px]" />
        </div>
        <div className="mt-[26px] grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <ReviewCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ContentPageSkeleton() {
  return (
    <div className="min-h-[calc(100vh-76px)] bg-black">
      <SkeletonStatus label="Loading page" />
      <div
        aria-hidden="true"
        className="mx-auto w-[min(100%-48px,1180px)] py-16 max-[600px]:w-[min(100%-36px,1180px)]"
      >
        <Skeleton className="mx-auto h-3 w-28" />
        <Skeleton className="mx-auto mt-5 h-12 w-[min(100%,520px)]" />
        <Skeleton className="mx-auto mt-5 h-4 w-[min(100%,380px)]" />
        <div className="mt-14 grid grid-cols-2 gap-9.5 max-[680px]:grid-cols-1">
          <Skeleton className="h-[420px] rounded-[18px]" />
          <div className="flex flex-col gap-4 pt-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-4 h-24 w-full rounded-[6px]" />
          </div>
        </div>
      </div>
    </div>
  )
}

export { ServicesPageSkeleton, ReviewsPageSkeleton, ContentPageSkeleton }
export default ContentPageSkeleton
