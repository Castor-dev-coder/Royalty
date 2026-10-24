import { useEffect, useRef, useState } from 'react'
import { ApiError, ConflictError, ValidationError, submitReviewRequest } from '../lib/api.js'

const CATEGORIES = [
  { key: 'service', label: 'Service', aria: 'Rate the service' },
  { key: 'products', label: 'Products', aria: 'Rate the products' },
  { key: 'staff', label: 'Staff customer service', aria: 'Rate the staff customer service' },
  { key: 'timeManagement', label: 'Time management', aria: 'Rate the time management' },
]

const MAX_COMMENT = 2000

// In-progress drafts live in memory only: a 401/refresh recovery (or a
// re-login) must not lose what the customer already typed.
const draftStore = new Map()
const emptyDraft = {
  ratings: { service: 0, products: 0, staff: 0, timeManagement: 0 },
  comment: '',
}

function draftFor(appointmentId) {
  return draftStore.get(appointmentId) ?? emptyDraft
}

function StarGroup({ category, value, error, onRate }) {
  return (
    <fieldset className="m-0 flex flex-col gap-[7px] border-0 p-0">
      <legend className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase">{category.label}</legend>
      <div className="flex items-center gap-[3px]" role="radiogroup" aria-label={category.aria}>
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            className={`cursor-pointer text-[1.65rem] leading-none transition-colors duration-[180ms] ${
              star <= value ? 'text-[var(--gold)]' : 'text-[#3a3835]'
            }`}
            key={star}
          >
            <input
              aria-label={`${category.aria}: ${star} of 5`}
              checked={value === star}
              className="sr-only"
              name={`review-${category.key}`}
              onChange={() => onRate(star)}
              type="radio"
              value={star}
            />
            <span aria-hidden="true">★</span>
          </label>
        ))}
        <span className="ml-2 text-[0.68rem] text-[#aaa7a0]">{value > 0 ? `${value} / 5` : 'Not rated'}</span>
      </div>
      {error && (
        <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

// Visit review: four required category ratings + optional comment.
// Comments render as text only (no dangerouslySetInnerHTML anywhere).
function ReviewForm({ appointmentId, onSuccess, onDone }) {
  const initial = draftFor(appointmentId)
  const [ratings, setRatings] = useState(initial.ratings)
  const [comment, setComment] = useState(initial.comment)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | done
  const submitRef = useRef(false)

  // Keep the draft in memory across re-mounts (session recovery, 401 retry).
  useEffect(() => {
    draftStore.set(appointmentId, { ratings, comment })
  }, [appointmentId, ratings, comment])

  const rate = (key) => (star) => setRatings((current) => ({ ...current, [key]: star }))

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitRef.current) return

    const nextErrors = {}
    for (const category of CATEGORIES) {
      if (!ratings[category.key]) nextErrors[category.key] = `Please rate: ${category.label.toLowerCase()}.`
    }
    if (comment.length > MAX_COMMENT) nextErrors.comment = `Keep the comment under ${MAX_COMMENT} characters.`
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    submitRef.current = true
    setStatus('submitting')
    setMessage('')
    try {
      const payload = {
        appointmentId,
        ratings: {
          service: ratings.service,
          products: ratings.products,
          staff: ratings.staff,
          timeManagement: ratings.timeManagement,
        },
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }
      const saved = await submitReviewRequest(payload)
      setStatus('done')
      setMessage('Thank you — your review was saved.')
      draftStore.delete(appointmentId) // submitted — the draft is spent
      onSuccess(saved && saved.review ? saved.review : saved)
    } catch (error) {
      setStatus('idle')
      if (error instanceof ConflictError) {
        setMessage('You already reviewed this visit.')
        onSuccess(null) // caller refreshes the item to show REVIEWED
      } else if (error instanceof ValidationError) {
        const details = error.details && typeof error.details === 'object' ? error.details : {}
        const mapped = {}
        for (const category of CATEGORIES) {
          if (details[category.key]) mapped[category.key] = String(details[category.key])
          else if (details.ratings) mapped[category.key] = String(details.ratings)
        }
        if (Object.keys(mapped).length === 0) mapped.form = error.message
        setErrors(mapped)
      } else if (error instanceof ApiError) {
        setMessage(error.message)
      } else {
        setMessage('Something went wrong. Your review was not saved.')
      }
    } finally {
      submitRef.current = false
    }
  }

  return (
    <form className="flex w-full flex-col gap-[14px]" noValidate onSubmit={handleSubmit}>
      <div className="flex flex-col gap-[14px]">
        {CATEGORIES.map((category) => (
          <StarGroup
            category={category}
            error={errors[category.key]}
            key={category.key}
            onRate={rate(category.key)}
            value={ratings[category.key]}
          />
        ))}
      </div>
      <div className="flex w-full flex-col gap-[7px]">
        <label className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase" htmlFor="review-comment">
          Comment (optional)
        </label>
        <textarea
          aria-describedby="review-comment-counter"
          className="min-h-[96px] w-full rounded-[10px] border border-[#3a3835] bg-[rgba(29,29,29,0.75)] px-[14px] py-[11px] text-[0.82rem] leading-[1.55] text-[#f3f0e8] outline-none placeholder:text-[#898783] focus:border-[var(--gold)]"
          id="review-comment"
          maxLength={MAX_COMMENT}
          onChange={(event) => setComment(event.target.value)}
          placeholder="How was your visit?"
          value={comment}
        />
        <div className="flex items-center justify-between">
          <span className="text-[0.62rem] text-[#898783]" id="review-comment-counter">
            {comment.length} / {MAX_COMMENT}
          </span>
          {errors.comment && (
            <span className="text-[0.68rem] text-[#e9a68c]" role="alert">
              {errors.comment}
            </span>
          )}
        </div>
      </div>
      {errors.form && (
        <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" role="alert">
          {errors.form}
        </p>
      )}
      {message && (
        <p className="m-0 text-[0.72rem] leading-[1.5] text-[#d8d4cb]" role="status">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-[10px]">
        <button
          className="btn-pill inline-flex min-h-[42px] cursor-pointer items-center justify-center rounded-full border border-[var(--gold)] bg-[var(--gold)] px-[1.35rem] py-[0.72rem] text-[0.68rem] font-bold tracking-[0.13em] text-[#111] uppercase hover:bg-[var(--gold-bright)] disabled:cursor-default disabled:opacity-60"
          disabled={status === 'submitting' || status === 'done'}
          type="submit"
        >
          {status === 'submitting' ? 'SUBMITTING…' : 'SUBMIT REVIEW'}
        </button>
        {onDone && (
          <button
            className="cursor-pointer rounded-full border border-[#3a3835] bg-transparent px-[1.25rem] py-[0.72rem] text-[0.66rem] font-semibold tracking-[0.12em] text-[#c9c5bb] uppercase hover:border-[var(--gold)] hover:text-[#f0efed]"
            onClick={onDone}
            type="button"
          >
            Close
          </button>
        )}
      </div>
    </form>
  )
}

export default ReviewForm
