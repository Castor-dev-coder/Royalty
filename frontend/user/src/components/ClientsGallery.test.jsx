// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ClientsGallery, { FALLBACK_GROUP, QA_TAG, buildGalleryGroups } from './ClientsGallery.jsx'
import { invalidatePublicCache } from '../lib/api.js'
import { resetOutageState } from '../lib/outage.js'

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Serves both public sources the gallery aggregates.
function stubSources({ services = [], reviews = [] } = {}) {
  const fetchMock = vi.fn(async (input) => {
    const url = String(input)
    if (url.includes('/services')) return jsonResponse(200, { data: { services } })
    if (url.includes('/reviews')) return jsonResponse(200, { data: { reviews } })
    return jsonResponse(404, { error: { message: 'Not found.' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const SERVICES = [
  {
    id: 'srv-hair',
    name: 'Deep Conditioning Treatment',
    categoryName: 'Hair',
    imageUrl: null,
  },
  {
    id: 'srv-nails',
    name: 'Deluxe Gel Manicure',
    categoryName: 'Nails',
    imageUrl: 'https://cdn.example.com/nails.jpg',
  },
  {
    id: 'srv-cut',
    name: 'Fringe Trim',
    categoryName: 'Hair Cutting',
    imageUrl: null,
  },
]

const REVIEWS = [
  {
    id: 'r1',
    comment: 'My hair felt softer for days after the treatment. · QA sample review',
    photos: [{ position: 1, url: 'https://cdn.example.com/review-1.jpg' }],
    appointment: {
      services: [{ serviceId: 'srv-hair', serviceName: 'Deep Conditioning Treatment' }],
    },
  },
  {
    id: 'r2',
    comment: 'Quick fringe trim before an event. · QA sample review',
    visiblePhotos: [{ id: 'p2', url: 'https://cdn.example.com/review-2.jpg', alt: 'Fresh fringe trim' }],
    serviceId: 'srv-cut',
    serviceName: 'Fringe Trim',
  },
  {
    id: 'r3',
    comment: 'It went great.',
    photos: [
      { url: 'https://cdn.example.com/hidden.jpg', hidden: true },
      { url: 'https://cdn.example.com/no-category.jpg' },
    ],
  },
]

// The marquee mirrors every set (aria-hidden) for the seamless loop, so
// assertions scope to the primary sets only.
function primarySets(container) {
  return [...container.querySelectorAll('.cg-set:not([aria-hidden])')]
}

function primaryImages(container) {
  return primarySets(container).flatMap((set) => [...set.querySelectorAll('img')])
}

function rowFor(container, title) {
  const heading = [...container.querySelectorAll('.cg-category')].find(
    (node) => node.textContent === title,
  )
  expect(heading, `category row "${title}"`).toBeTruthy()
  return heading.closest('.cg-row')
}

// The first (non-mirrored) set of a row, where the visible cards live.
function primarySetFor(container, title) {
  return rowFor(container, title).querySelector('.cg-set:not([aria-hidden])')
}

// Small groups are repeated to fill the marquee loop, so distinct source URLs
// are the honest photo count.
function distinctPrimarySrcs(container) {
  return [...new Set(primaryImages(container).map((image) => image.src))]
}

beforeEach(() => {
  vi.unstubAllGlobals()
  invalidatePublicCache()
  resetOutageState()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ClientsGallery', () => {
  it('renders one marquee row per category with lazy, meaningful images', async () => {
    const fetchMock = stubSources({ services: SERVICES, reviews: REVIEWS })
    const { container } = render(<ClientsGallery />)
    await waitFor(() => expect(screen.getByText('Hair')).toBeTruthy())

    // Categories sorted alphabetically, fallback group last.
    const titles = [...container.querySelectorAll('.cg-category')].map((node) => node.textContent)
    expect(titles).toEqual(['Hair', 'Hair Cutting', 'Nails', FALLBACK_GROUP])

    // Both public sources were consulted.
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('/services'))).toBe(true)
    expect(urls.some((url) => url.includes('/reviews'))).toBe(true)

    const images = primaryImages(container)
    expect(distinctPrimarySrcs(container).length).toBe(4)
    for (const image of images) {
      expect(image.getAttribute('loading')).toBe('lazy')
      expect(image.alt.trim().length).toBeGreaterThan(0)
    }
    const alts = images.map((image) => image.alt)
    expect(alts).toContain('Client photo from Deep Conditioning Treatment')
    expect(alts).toContain('Fresh fringe trim')
    expect(alts).toContain('Photo of Deluxe Gel Manicure')
    expect(alts).toContain('Client gallery photo')

    // Photos flagged hidden are excluded client-side too.
    expect(container.querySelector('img[src="https://cdn.example.com/hidden.jpg"]')).toBeNull()
  })

  it('labels review-derived photos QA sample and leaves service photos unlabelled', async () => {
    stubSources({ services: SERVICES, reviews: REVIEWS })
    const { container } = render(<ClientsGallery />)
    await waitFor(() => expect(screen.getByText('Hair')).toBeTruthy())

    const hairSet = primarySetFor(container, 'Hair')
    expect(within(hairSet).getAllByText(QA_TAG).length).toBeGreaterThan(0)

    const nailsSet = primarySetFor(container, 'Nails')
    expect(within(nailsSet).queryAllByText(QA_TAG)).toHaveLength(0)
    expect(within(nailsSet).getAllByAltText('Photo of Deluxe Gel Manicure').length).toBeGreaterThan(0)
  })

  it('dedupes by absolute URL across the two sources, keeping the unlabelled service photo', async () => {
    stubSources({
      services: [{ id: 's1', name: 'Gel Manicure', categoryName: 'Nails', imageUrl: 'https://cdn.example.com/same.jpg' }],
      reviews: [
        {
          id: 'r1',
          comment: 'Great color. · QA sample review',
          photos: [{ url: 'https://cdn.example.com/same.jpg' }],
          serviceId: 's1',
          serviceName: 'Gel Manicure',
        },
      ],
    })
    const { container } = render(<ClientsGallery />)
    await waitFor(() => expect(screen.getByText('Nails')).toBeTruthy())

    expect(distinctPrimarySrcs(container)).toEqual(['https://cdn.example.com/same.jpg'])
    // The admin/service copy wins the URL, so it carries no QA sample tag.
    expect(rowFor(container, 'Nails').querySelector('.cg-tag')).toBeNull()
  })

  it('groups under the fallback name when the service category cannot be derived', async () => {
    stubSources({
      services: [],
      reviews: [
        {
          id: 'r9',
          comment: 'Lovely. · QA sample review',
          visiblePhotos: [{ url: 'https://cdn.example.com/unknown-service.jpg' }],
          serviceId: 'missing-service',
          serviceName: 'Mystery Service',
        },
      ],
    })
    const { container } = render(<ClientsGallery />)
    await waitFor(() => expect(screen.getByText(FALLBACK_GROUP)).toBeTruthy())

    expect(distinctPrimarySrcs(container)).toEqual(['https://cdn.example.com/unknown-service.jpg'])
    expect(
      primaryImages(container).every((image) => image.alt === 'Client photo from Mystery Service'),
    ).toBe(true)
  })

  it('shows the empty state when no photo is eligible', async () => {
    stubSources({
      services: [{ id: 's1', name: 'Hair Color', categoryName: 'Hair Coloring', imageUrl: null }],
      reviews: [
        {
          id: 'r1',
          comment: 'Nice.',
          photos: [{ url: 'https://cdn.example.com/hidden.jpg', hidden: true }],
        },
      ],
    })
    render(<ClientsGallery />)
    await waitFor(() => expect(screen.getByText('No gallery photos yet')).toBeTruthy())
    expect(screen.getByText(/will appear here once they are published/)).toBeTruthy()
    expect(screen.queryByText('QA sample')).toBeNull()
  })

  it('shows the empty state when both sources fail to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('failed to fetch')
      }),
    )
    render(<ClientsGallery />)
    await waitFor(() => expect(screen.getByText('No gallery photos yet')).toBeTruthy())
  })

  it('toggles the marquee between PAUSE and PLAY', async () => {
    stubSources({ services: SERVICES, reviews: REVIEWS })
    const { container } = render(<ClientsGallery />)
    await waitFor(() => expect(screen.getByText('Hair')).toBeTruthy())

    const button = screen.getByRole('button', { name: /PAUSE/ })
    expect(button.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole('button', { name: /PLAY/ })).toBeTruthy())
    expect(screen.getByRole('button', { name: /PLAY/ }).getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.cg-root').dataset.paused).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /PLAY/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /PAUSE/ })).toBeTruthy())
    expect(container.querySelector('.cg-root').dataset.paused).toBe('false')
  })
})

describe('buildGalleryGroups', () => {
  it('favors visiblePhotos and reads service refs from either payload shape', () => {
    const groups = buildGalleryGroups({
      services: [{ id: 'svc1', name: 'Updo', categoryName: 'Hair' }],
      reviews: [
        {
          id: 'a',
          comment: 'x · QA sample review',
          visiblePhotos: [{ url: 'https://cdn.example.com/visible.jpg' }],
          serviceName: 'Updo',
          serviceId: 'svc1',
        },
        {
          id: 'b',
          comment: 'y · QA sample review',
          photos: [{ url: 'https://cdn.example.com/legacy.jpg' }],
          appointment: { services: [{ serviceId: 'svc1', serviceName: 'Updo' }] },
        },
      ],
    })
    expect(groups.map((group) => group.name)).toEqual(['Hair'])
    expect(groups[0].photos.map((photo) => photo.url)).toEqual([
      'https://cdn.example.com/visible.jpg',
      'https://cdn.example.com/legacy.jpg',
    ])
    expect(groups[0].photos.every((photo) => photo.tag === QA_TAG)).toBe(true)
  })

  it('drops duplicate absolute URLs and photos flagged hidden', () => {
    const groups = buildGalleryGroups({
      services: [
        { id: 'svc1', name: 'Manicure', categoryName: 'Nails', imageUrl: 'https://cdn.example.com/dup.jpg' },
      ],
      reviews: [
        {
          id: 'a',
          comment: 'x · QA sample review',
          photos: [
            { url: 'https://cdn.example.com/dup.jpg' },
            { url: 'https://cdn.example.com/dup.jpg' },
            { url: 'https://cdn.example.com/gone.jpg', hidden: true },
            { url: '' },
          ],
          serviceId: 'svc1',
          serviceName: 'Manicure',
        },
      ],
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].photos).toHaveLength(1)
    expect(groups[0].photos[0]).toMatchObject({ url: 'https://cdn.example.com/dup.jpg', tag: null })
  })
})
