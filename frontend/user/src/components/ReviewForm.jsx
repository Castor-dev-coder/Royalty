import { useEffect, useRef, useState } from 'react'
import { ApiError, ConflictError, ValidationError, submitReviewRequest, uploadReviewPhoto } from '../lib/api.js'
import { MAX_PHOTOS, makePreviewUrl, photoFailureMessage, validatePhotoFile } from '../lib/reviewPhotos.js'

const CATEGORIES = [
  { key: 'service', label: 'Service', aria: 'Rate the service' },
  { key: 'products', label: 'Products', aria: 'Rate the products' },
  { key: 'staff', label: 'Staff customer service', aria: 'Rate the staff customer service' },
  { key: 'timeManagement', label: 'Time management', aria: 'Rate the time management' },
]

const MAX_COMMENT = 2000

// In-progress drafts live in memory only: a 401/refresh recovery (or a
// re-login) must not lose what the customer already typed. Photo drafts are
// memory-only too (File + object URL in component state) — never web storage.
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

// One chosen photo. `status` walks queued -> uploading -> done | failed.
// A failed photo keeps its preview and gets a per-photo RETRY; the saved
// review is never touched again.
function PhotoDraft({ entry, index, onRemove, onRetry }) {
  const removable = entry.status !== 'done' && entry.status !== 'uploading'
  return (
    <li className="relative m-0 w-[112px] list-none p-0">
      <div className="overflow-hidden rounded-[8px] border border-[#3a3835]">
        <img
          alt={`Photo ${index + 1} preview`}
          className="block aspect-[4/3] w-full object-cover"
          draggable={false}
          src={entry.previewUrl}
        />
      </div>
      {removable && (
        <button
          aria-label={`Remove photo ${index + 1}`}
          className="absolute top-[5px] right-[5px] grid size-6 cursor-pointer place-items-center rounded-full border border-[#3a3835] bg-black/75 text-[13px] leading-none text-[#c9c5bb] hover:border-[#e9a68c] hover:text-[#e9a68c]"
          onClick={() => onRemove(entry.key)}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
      {entry.status === 'uploading' && (
        <>
          <div
            aria-label={`Upload progress for photo ${index + 1}`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={entry.progress}
            className="mt-[6px] h-[3px] w-full overflow-hidden rounded-full bg-[#2a2825]"
            role="progressbar"
          >
            <div className="h-full rounded-full bg-[var(--gold)] transition-[width] duration-200" style={{ width: `${entry.progress}%` }} />
          </div>
          <p className="m-0 mt-[4px] text-[0.62rem] text-[#aaa7a0]">Uploading… {entry.progress}%</p>
        </>
      )}
      {entry.status === 'queued' && (
        <p className="m-0 mt-[6px] text-[0.62rem] text-[#aaa7a0]">Waiting…</p>
      )}
      {entry.status === 'done' && (
        <p className="m-0 mt-[6px] text-[0.62rem] font-semibold tracking-[0.1em] text-[#9fd0a5] uppercase">Uploaded</p>
      )}
      {entry.status === 'failed' && (
        <>
          <p className="m-0 mt-[6px] text-[0.62rem] leading-[1.45] text-[#e9a68c]" role="alert">
            {entry.error}
          </p>
          <button
            aria-label={`Retry upload of photo ${index + 1}`}
            className="mt-[6px] cursor-pointer rounded-full border border-[#e9a68c] bg-transparent px-[0.85rem] py-[0.35rem] text-[0.6rem] font-bold tracking-[0.12em] text-[#e9a68c] uppercase hover:border-[var(--gold)] hover:text-[var(--gold)]"
            onClick={() => onRetry(entry.key)}
            type="button"
          >
            Retry
          </button>
        </>
      )}
    </li>
  )
}

// Visit review: four required category ratings + optional comment + up to 3
// photos. The review is submitted FIRST; photos then upload ONE BY ONE. If a
// photo fails it keeps its preview with a per-photo RETRY and the rest keep
// going — the saved review is never resubmitted. Comments render as text only
// (no dangerouslySetInnerHTML anywhere).
function ReviewForm({ appointmentId, onSuccess, onDone }) {
  const initial = draftFor(appointmentId)
  const [ratings, setRatings] = useState(initial.ratings)
  const [comment, setComment] = useState(initial.comment)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | photos | done
  const [photos, setPhotos] = useState([]) // in-memory photo drafts only
  const [rejections, setRejections] = useState([])
  const submitRef = useRef(false)
  const savedRef = useRef(null) // saved review — once set, NEVER resubmitted
  const photosRef = useRef([])
  const uploadingRef = useRef(false)
  const nextKeyRef = useRef(1)

  // Keep the draft in memory across re-mounts (session recovery, 401 retry).
  useEffect(() => {
    draftStore.set(appointmentId, { ratings, comment })
  }, [appointmentId, ratings, comment])

  // Preview object URLs are memory-only and released on unmount.
  useEffect(() => {
    return () => {
      for (const entry of photosRef.current) {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
      }
    }
  }, [])

  const rate = (key) => (star) => setRatings((current) => ({ ...current, [key]: star }))
  const saved = status === 'photos' || status === 'done'

  function setPhotoList(next) {
    const value = typeof next === 'function' ? next(photosRef.current) : next
    photosRef.current = value
    setPhotos(value)
  }

  function updatePhoto(key, patch) {
    setPhotoList((current) => current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)))
  }

  function removePhoto(key) {
    const entry = photosRef.current.find((item) => item.key === key)
    if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl)
    setPhotoList((current) => current.filter((item) => item.key !== key))
  }

  async function handleFiles(fileList) {
    const chosen = Array.from(fileList ?? [])
    if (chosen.length === 0) return
    const rejected = []
    for (const file of chosen) {
      if (photosRef.current.length >= MAX_PHOTOS) {
        rejected.push(`${file.name}: a review can have at most ${MAX_PHOTOS} photos.`)
        continue
      }
      const result = await validatePhotoFile(file)
      if (!result.ok) {
        rejected.push(`${file.name}: ${result.error}`)
        continue
      }
      setPhotoList((current) => [
        ...current,
        {
          key: nextKeyRef.current++,
          file,
          mime: result.mime,
          previewUrl: makePreviewUrl(file),
          status: 'queued',
          progress: 0,
          error: null,
        },
      ])
    }
    setRejections(rejected)
    // Photos chosen after the review was saved upload immediately.
    if (savedRef.current) runUploads()
  }

  function uploadOne(entry) {
    const reviewId = savedRef.current?.id
    updatePhoto(entry.key, { status: 'uploading', progress: 0, error: null })
    return uploadReviewPhoto(reviewId, entry.file, entry.mime, {
      onProgress: (percent) => updatePhoto(entry.key, { progress: percent }),
    }).then(
      () => {
        updatePhoto(entry.key, { status: 'done', progress: 100, error: null })
      },
      (error) => {
        // Keep the saved review and this photo's preview; the loop below
        // continues with the remaining photos.
        updatePhoto(entry.key, { status: 'failed', progress: 0, error: photoFailureMessage(error) })
      },
    )
  }

  // Sequential queue: one photo per request, in order. A failure never stops
  // the queue and never re-touches the review.
  function runUploads() {
    if (uploadingRef.current || !savedRef.current) return
    uploadingRef.current = true
    const step = () => {
      const next = photosRef.current.find((entry) => entry.status === 'queued')
      if (!next) {
        uploadingRef.current = false
        return undefined
      }
      return uploadOne(next).then(step)
    }
    step()
  }

  function handleRetry(key) {
    updatePhoto(key, { status: 'queued', progress: 0, error: null })
    runUploads()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitRef.current) return
    if (savedRef.current) return // the review is saved — never resubmit it

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
      const raw = await submitReviewRequest(payload)
      const review = raw && raw.review ? raw.review : raw
      const normalized = {
        ...(review && typeof review === 'object' ? review : {}),
        id: review?.id ?? raw?.id ?? null,
      }
      savedRef.current = normalized
      draftStore.delete(appointmentId) // submitted — the draft is spent
      setMessage('Thank you — your review was saved.')
      if (photosRef.current.length > 0) {
        setStatus('photos')
        onSuccess(normalized, { photoPhase: true })
        runUploads()
      } else {
        setStatus('done')
        onSuccess(normalized, { photoPhase: false })
      }
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

  const uploadedCount = photos.filter((entry) => entry.status === 'done').length
  const failedCount = photos.filter((entry) => entry.status === 'failed').length
  const activeCount = photos.filter((entry) => entry.status === 'queued' || entry.status === 'uploading').length

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

      <div className="flex w-full flex-col gap-[7px]">
        <span className="text-[0.62rem] font-semibold tracking-[0.12em] text-[#918c82] uppercase">
          Photos (optional — up to {MAX_PHOTOS})
        </span>
        {!saved && (
          <p className="m-0 text-[0.68rem] leading-[1.5] text-[#898783]">
            PNG or JPG, 10 MB max each. Your review is saved first; photos upload right after, one by one.
          </p>
        )}
        {photos.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-[10px] p-0">
            {photos.map((entry, index) => (
              <PhotoDraft
                entry={entry}
                index={index}
                key={entry.key}
                onRemove={removePhoto}
                onRetry={handleRetry}
              />
            ))}
          </ul>
        )}
        {photos.length < MAX_PHOTOS && (
          <>
            <input
              accept="image/png,image/jpeg"
              aria-label="Add photo"
              className="sr-only"
              id="review-photos-input"
              multiple
              onChange={(event) => {
                void handleFiles(event.target.files)
                event.target.value = ''
              }}
              type="file"
            />
            <label
              className="inline-flex w-fit cursor-pointer items-center rounded-full border border-[#3a3835] bg-transparent px-[1.1rem] py-[0.6rem] text-[0.66rem] font-semibold tracking-[0.12em] text-[#c9c5bb] uppercase hover:border-[var(--gold)] hover:text-[#f0efed]"
              htmlFor="review-photos-input"
            >
              + Add photo
            </label>
          </>
        )}
        {rejections.map((rejection) => (
          <p className="m-0 text-[0.68rem] leading-[1.5] text-[#e9a68c]" key={rejection} role="alert">
            {rejection}
          </p>
        ))}
        {saved && photos.length > 0 && (
          <p className="m-0 text-[0.72rem] leading-[1.5] text-[#d8d4cb]" role="status">
            {activeCount > 0
              ? `Uploading photos… ${uploadedCount} of ${photos.length} uploaded.`
              : failedCount > 0
                ? `${uploadedCount} of ${photos.length} photos uploaded. ${failedCount} failed — your review is saved; retry below.`
                : `All ${photos.length} photos uploaded.`}
          </p>
        )}
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
          disabled={status === 'submitting' || saved}
          type="submit"
        >
          {saved ? 'REVIEW SAVED' : status === 'submitting' ? 'SUBMITTING…' : 'SUBMIT REVIEW'}
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
