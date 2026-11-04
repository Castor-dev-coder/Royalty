// Customer gallery: horizontal auto-scrolling marquee rows of salon photos,
// grouped by service category. Two public sources are aggregated in read-only
// fashion (no new endpoints): visible review photos from GET /reviews and
// admin-uploaded service photos from GET /services (imageUrl). Photos are
// deduped by absolute URL across sources; review-derived photos carry a small
// 'QA sample' tag because this QA dataset is synthetic.
import { useEffect, useState } from 'react'
import EmptyState from './EmptyState.jsx'
import SafeImage from './SafeImage.jsx'
import { fetchReviewList, fetchServices } from '../lib/api.js'
import { useRecoveryTick } from '../lib/useOutage.js'
import './clients-gallery.css'

export const QA_TAG = 'QA sample'
export const FALLBACK_GROUP = 'Client Gallery'

/** Normalizes a photo URL to its absolute form for cross-source dedupe. */
// eslint-disable-next-line react-refresh/only-export-components -- exported for tests; the helper file boundary is fixed by spec.
export function absoluteUrl(url) {
  try {
    return new URL(String(url), globalThis.location?.href ?? 'http://localhost/').href
  } catch {
    return String(url)
  }
}

// A review names its service in different places across payload shapes:
// top-level serviceName/serviceId when present, else the first appointment
// service. Either can be absent.
function reviewServiceRef(review) {
  const fromAppointment = review?.appointment?.services?.[0]
  return {
    serviceId: review?.serviceId ?? fromAppointment?.serviceId ?? null,
    serviceName: review?.serviceName ?? fromAppointment?.serviceName ?? null,
  }
}

// The API returns `visiblePhotos` (hidden/rejected/private already excluded
// server-side) on newer payloads and plain `photos` on older ones. The client
// still guards against any photo flagged hidden.
function photoList(review) {
  const list = review?.visiblePhotos ?? review?.photos ?? []
  return Array.isArray(list) ? list : []
}

function toRows(value, key) {
  if (Array.isArray(value)) return value
  const rows = value?.[key]
  return Array.isArray(rows) ? rows : []
}

/**
 * Aggregates both photo sources into ordered category groups.
 * Each entry: { url, group, tag, alt }. Review photos group under the review
 * service's category when it can be derived from the services catalogue,
 * otherwise 'Client Gallery'; service photos group by categoryName.
 * Admin/service photos are processed first, so a URL shared with a review
 * keeps its unlabelled official treatment.
 */
// eslint-disable-next-line react-refresh/only-export-components -- exported for tests; the helper file boundary is fixed by spec.
export function buildGalleryGroups({ reviews = [], services = [] } = {}) {
  const byId = new Map()
  const byName = new Map()
  for (const service of services) {
    if (!service) continue
    if (service.id != null) byId.set(String(service.id), service)
    if (typeof service.name === 'string' && service.name) {
      byName.set(service.name.toLowerCase(), service)
    }
  }

  const categoryFor = ({ serviceId, serviceName }) => {
    const match =
      (serviceId != null && byId.get(String(serviceId))) ||
      (serviceName ? byName.get(String(serviceName).toLowerCase()) : null)
    const category = match?.categoryName
    return typeof category === 'string' && category.trim() ? category.trim() : FALLBACK_GROUP
  }

  const seen = new Map()
  const groups = new Map()

  const add = (entry) => {
    const key = absoluteUrl(entry.url)
    if (seen.has(key)) return
    seen.set(key, entry)
    if (!groups.has(entry.group)) groups.set(entry.group, [])
    groups.get(entry.group).push(entry)
  }

  for (const service of services) {
    const url = typeof service?.imageUrl === 'string' ? service.imageUrl.trim() : ''
    if (!url) continue
    const group =
      typeof service?.categoryName === 'string' && service.categoryName.trim()
        ? service.categoryName.trim()
        : FALLBACK_GROUP
    const name = typeof service?.name === 'string' && service.name ? service.name : ''
    add({
      url,
      group,
      tag: null,
      alt: name ? `Photo of ${name}` : `${group} service photo`,
    })
  }

  for (const review of reviews) {
    const ref = reviewServiceRef(review)
    const group = categoryFor(ref)
    const serviceName = typeof ref.serviceName === 'string' && ref.serviceName ? ref.serviceName : ''
    for (const photo of photoList(review)) {
      const url = typeof photo?.url === 'string' ? photo.url.trim() : ''
      if (!url || photo?.hidden === true) continue
      const photoAlt = typeof photo?.alt === 'string' ? photo.alt.trim() : ''
      add({
        url,
        group,
        tag: QA_TAG,
        alt: photoAlt || (serviceName ? `Client photo from ${serviceName}` : 'Client gallery photo'),
      })
    }
  }

  const order = [...groups.keys()].sort((a, b) => {
    if (a === FALLBACK_GROUP) return 1
    if (b === FALLBACK_GROUP) return -1
    return a.localeCompare(b)
  })
  return order.map((name) => ({ name, photos: groups.get(name) }))
}

function PauseGlyph() {
  return (
    <svg aria-hidden="true" className="cg-toggle-glyph" focusable="false" viewBox="0 0 12 12">
      <path d="M3.5 2v8M8.5 2v8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function PlayGlyph() {
  return (
    <svg aria-hidden="true" className="cg-toggle-glyph" focusable="false" viewBox="0 0 12 12">
      <path d="M3.5 2.2 9.5 6l-6 3.8V2.2Z" fill="currentColor" />
    </svg>
  )
}

function CrownBadge() {
  return (
    <svg aria-hidden="true" className="cg-crown" focusable="false" viewBox="0 0 24 24" fill="none">
      <path
        d="M4.5 17.5V7l4.4 4.4L12 5l3.1 6.4L19.5 7v10.5h-15Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path d="M4.5 20.5h15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  )
}

// One marquee row: the photo set is repeated enough to fill the viewport and
// mirrored into a second identical set so translateX(-50%) loops seamlessly.
// The mirrored set is aria-hidden and carries the same alt text on its images.
function MarqueeRow({ group }) {
  const photos = group.photos
  const repeat = Math.max(1, Math.ceil(8 / photos.length))
  const cards = Array.from({ length: photos.length * repeat }, (_, index) => ({
    photo: photos[index % photos.length],
    featured: index % 4 === 1,
  }))
  const durationSeconds = Math.max(24, cards.length * 4)

  return (
    <div className="cg-row">
      <h3 className="cg-category">{group.name}</h3>
      <div className="cg-marquee">
        <div className="cg-track" style={{ '--cg-duration': `${durationSeconds}s` }}>
          {[false, true].map((duplicated) => (
            <ul
              aria-hidden={duplicated ? 'true' : undefined}
              className="cg-set"
              key={duplicated ? 'mirror' : 'primary'}
            >
              {cards.map((card, index) => (
                <li key={`${duplicated ? 'm' : 'p'}-${index}`}>
                  <figure className={`cg-card${card.featured ? ' cg-card--featured' : ''}`}>
                    <SafeImage
                      alt={card.photo.alt}
                      className="cg-card-img"
                      loading="lazy"
                      src={card.photo.url}
                    />
                    {card.featured ? <CrownBadge /> : null}
                    {card.photo.tag ? <span className="cg-tag">{card.photo.tag}</span> : null}
                  </figure>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  )
}

function ClientsGallery() {
  // Refetches the gallery whenever an outage recovers, like the other pages.
  const recoveryTick = useRecoveryTick()
  // null while loading; [] is a genuine empty state.
  const [groups, setGroups] = useState(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let stale = false
    Promise.allSettled([fetchServices(), fetchReviewList({ page: 1, limit: 100 })]).then(
      ([servicesResult, reviewsResult]) => {
        if (stale) return
        const services =
          servicesResult.status === 'fulfilled' ? toRows(servicesResult.value, 'services') : []
        const reviews =
          reviewsResult.status === 'fulfilled' ? toRows(reviewsResult.value, 'reviews') : []
        setGroups(buildGalleryGroups({ reviews, services }))
      },
    )
    return () => {
      stale = true
    }
  }, [recoveryTick])

  if (!groups) return null

  if (groups.length === 0) {
    return (
      <div className="cg-root cg-root--empty">
        <EmptyState
          image="/images/empty-states/empty-gallery.svg"
          message="Client photos and stylist portfolios will appear here once they are published."
          title="No gallery photos yet"
        />
      </div>
    )
  }

  return (
    <div className="cg-root" data-paused={paused ? 'true' : 'false'}>
      <svg
        aria-hidden="true"
        className="cg-arcs"
        focusable="false"
        preserveAspectRatio="none"
        viewBox="0 0 1200 900"
      >
        <path d="M-60 320C280 60 920 60 1260 340" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M-60 620C340 380 860 400 1260 680" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      <div className="cg-controls">
        <button
          aria-pressed={paused}
          className="cg-toggle"
          onClick={() => setPaused((value) => !value)}
          type="button"
        >
          {paused ? <PlayGlyph /> : <PauseGlyph />}
          {paused ? 'PLAY' : 'PAUSE'}
        </button>
      </div>
      <div className="cg-rows">
        {groups.map((group) => (
          <MarqueeRow group={group} key={group.name} />
        ))}
      </div>
    </div>
  )
}

export default ClientsGallery
