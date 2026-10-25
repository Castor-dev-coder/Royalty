import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import EmptyState from './EmptyState.jsx'
import ReviewCard from './ReviewCard.jsx'

const GAP = 24
const DRAG_START_PX = 6
const SWIPE_THRESHOLD_RATIO = 0.2

function perViewFor(width) {
  if (width < 640) return 1
  if (width < 1024) return 2
  return 3
}

// Reviews carousel built on the review records already in the application:
// previous/next controls, position dots, touch/mouse drag with snapping,
// arrow-key navigation, and reduced-motion support (global CSS).
function ReviewsCarousel({ reviews }) {
  const containerRef = useRef(null)
  const dragState = useRef(null)
  const [perView, setPerView] = useState(3)
  const [step, setStep] = useState(0)
  const [rawIndex, setRawIndex] = useState(0)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  const count = reviews.length
  const maxIndex = Math.max(0, count - perView)
  // The visible position is clamped to the current window, so changing the
  // slide count at a new viewport can never point past the last review.
  const index = Math.min(rawIndex, maxIndex)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    function measure() {
      const nextPerView = perViewFor(container.clientWidth)
      setPerView(nextPerView)
      // Cards are percentage-sized, so the slide step must be recomputed on
      // every width change — not only when the slide count changes.
      const cardWidth = (container.clientWidth - (nextPerView - 1) * GAP) / nextPerView
      setStep(cardWidth + GAP)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const goTo = useCallback(
    (nextIndex) => {
      setRawIndex(Math.min(Math.max(nextIndex, 0), maxIndex))
    },
    [maxIndex],
  )

  function handleKeyDown(event) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(index + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      goTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goTo(maxIndex)
    }
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    dragState.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
    }
  }

  function handlePointerMove(event) {
    const state = dragState.current
    if (!state || event.pointerId !== state.id) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY

    if (!state.axis) {
      if (Math.abs(dx) < DRAG_START_PX && Math.abs(dy) < DRAG_START_PX) return
      state.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (state.axis === 'x') {
        setDragging(true)
        trackRefCapture(event.pointerId)
      }
    }
    if (state.axis !== 'x') return

    // Rubber-band resistance past the first/last slide.
    const atStart = index === 0 && dx > 0
    const atEnd = index === maxIndex && dx < 0
    setDragOffset(atStart || atEnd ? dx * 0.3 : dx)
  }

  function trackRefCapture(pointerId) {
    const track = containerRef.current?.querySelector('[data-carousel-track]')
    if (track?.setPointerCapture) track.setPointerCapture(pointerId)
  }

  function handlePointerUp(event) {
    const state = dragState.current
    if (!state || event.pointerId !== state.id) return
    dragState.current = null

    if (state.axis === 'x') {
      const dx = event.clientX - state.startX
      const threshold = step * SWIPE_THRESHOLD_RATIO
      if (dx <= -threshold) goTo(index + 1)
      else if (dx >= threshold) goTo(index - 1)
    }

    setDragging(false)
    setDragOffset(0)
    const track = containerRef.current?.querySelector('[data-carousel-track]')
    if (track?.hasPointerCapture?.(event.pointerId)) {
      track.releasePointerCapture(event.pointerId)
    }
  }

  if (count === 0) {
    return (
      <EmptyState
        image="/images/empty-states/empty-reviews.svg"
        message="Client stories will appear here once reviews are shared."
        title="No reviews yet"
      />
    )
  }

  const visibleFrom = index + 1
  const visibleTo = Math.min(index + perView, count)

  return (
    <div
      aria-label="Customer reviews carousel"
      aria-roledescription="carousel"
      className="focus-visible:outline-2 focus-visible:outline-offset-6 focus-visible:outline-(--gold-bright)"
      onKeyDown={handleKeyDown}
      ref={containerRef}
      role="region"
      tabIndex={0}
    >
      <div
        className="overflow-hidden"
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ touchAction: 'pan-y' }}
      >
        <ul
          className="m-0 flex list-none items-stretch p-0"
          data-carousel-track=""
          style={{
            gap: `${GAP}px`,
            transform: `translateX(${-index * step + dragOffset}px)`,
            transition: dragging ? 'none' : 'transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1)',
            '--per-view': perView,
          }}
        >
          {reviews.map((review, reviewIndex) => (
            <li
              className="flex"
              key={review.id ?? `review-${reviewIndex}`}
              style={{
                flex: '0 0 calc((100% - (var(--per-view) - 1) * 24px) / var(--per-view))',
              }}
            >
              <div className="w-full [&>article]:h-full">
                <ReviewCard
                  category={review.category}
                  date={review.date}
                  images={review.images}
                  name={review.name}
                  rating={review.rating}
                  text={review.text}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-7 flex items-center justify-center gap-5">
        <button
          aria-label="Previous review"
          className="grid size-[42px] cursor-pointer place-items-center rounded-full border border-[var(--gold)] bg-transparent text-[var(--gold)] transition-[background-color,color,opacity] duration-[180ms] enabled:hover:bg-[var(--gold)] enabled:hover:text-[#111] disabled:cursor-default disabled:opacity-[0.28]"
          disabled={index <= 0}
          onClick={() => goTo(index - 1)}
          type="button"
        >
          <svg aria-hidden="true" className="w-[18px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <ol className="m-0 flex list-none items-center gap-2.5 p-0">
          {Array.from({ length: maxIndex + 1 }, (_, dotIndex) => (
            <li key={dotIndex}>
              <button
                aria-label={
                  perView > 1
                    ? `Show reviews ${dotIndex + 1}–${Math.min(dotIndex + perView, count)} of ${count}`
                    : `Show review ${dotIndex + 1} of ${count}`
                }
                className={`h-2 cursor-pointer rounded-full border-0 p-0 transition-[width,background-color] duration-[220ms] ${
                  dotIndex === index
                    ? 'w-7 bg-[var(--gold)]'
                    : 'w-2 bg-[rgba(212,180,92,0.32)] hover:bg-[rgba(212,180,92,0.55)]'
                }`}
                onClick={() => goTo(dotIndex)}
                type="button"
              />
            </li>
          ))}
        </ol>

        <button
          aria-label="Next review"
          className="grid size-[42px] cursor-pointer place-items-center rounded-full border border-[var(--gold)] bg-transparent text-[var(--gold)] transition-[background-color,color,opacity] duration-[180ms] enabled:hover:bg-[var(--gold)] enabled:hover:text-[#111] disabled:cursor-default disabled:opacity-[0.28]"
          disabled={index >= maxIndex}
          onClick={() => goTo(index + 1)}
          type="button"
        >
          <svg aria-hidden="true" className="w-[18px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.7]" viewBox="0 0 24 24">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <p aria-live="polite" className="m-0 mt-3 text-center text-[13px] tracking-[0.14em] text-(--muted) uppercase">
        Review {visibleFrom}{visibleTo !== visibleFrom ? `–${visibleTo}` : ''} of {count}
      </p>
    </div>
  )
}

export default ReviewsCarousel
