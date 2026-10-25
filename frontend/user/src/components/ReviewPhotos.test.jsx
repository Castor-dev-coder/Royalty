// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ReviewPhotos from './ReviewPhotos.jsx'

const photos = [
  { id: 'pa', position: 1, url: '/uploads/a.png' },
  { id: 'pb', position: 2, url: '/uploads/b.png' },
]

afterEach(cleanup)

describe('ReviewPhotos', () => {
  it('renders lazy 4:3 cover thumbnails with the exact alt form', () => {
    render(<ReviewPhotos photos={photos} reviewerName="Jane Doe" />)
    const first = screen.getByAltText("Photo 1 of 2 from JD's review")
    expect(first.getAttribute('loading')).toBe('lazy')
    expect(first.className).toContain('aspect-[4/3]')
    expect(first.className).toContain('object-cover')
    expect(screen.getByAltText("Photo 2 of 2 from JD's review")).toBeTruthy()
  })

  it('falls back to `a customer` when the API exposes no reviewer name', () => {
    render(<ReviewPhotos photos={[photos[1]]} />)
    expect(screen.getByAltText("Photo 1 of 1 from a customer's review")).toBeTruthy()
  })

  it('renders nothing without photos', () => {
    const { container } = render(<ReviewPhotos photos={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('thumbnails are buttons that open the lightbox; Escape closes it and restores focus', () => {
    render(<ReviewPhotos photos={photos} reviewerName="Jane Doe" />)
    const thumb = screen.getByRole('button', { name: "Photo 1 of 2 from JD's review" })
    thumb.focus() // real browsers focus a button on click
    fireEvent.click(thumb)

    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(thumb)
  })

  it('left/right arrows navigate between the review photos', () => {
    render(<ReviewPhotos photos={photos} reviewerName="Jane Doe" />)
    fireEvent.click(screen.getByRole('button', { name: "Photo 1 of 2 from JD's review" }))

    // The lightbox image carries the same alt form (thumbnail + lightbox).
    expect(screen.getAllByAltText("Photo 1 of 2 from JD's review")).toHaveLength(2)

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getAllByAltText("Photo 2 of 2 from JD's review")).toHaveLength(2)

    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(screen.getAllByAltText("Photo 1 of 2 from JD's review")).toHaveLength(2)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
