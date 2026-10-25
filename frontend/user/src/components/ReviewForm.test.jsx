// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConflictError, submitReviewRequest, uploadReviewPhoto } from '../lib/api.js'
import { MAX_PHOTO_BYTES } from '../lib/reviewPhotos.js'
import ReviewForm from './ReviewForm.jsx'

vi.mock('../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    submitReviewRequest: vi.fn(),
    uploadReviewPhoto: vi.fn(),
  }
})

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01])

function pngFile(name = 'photo.png') {
  return new File([PNG_BYTES], name, { type: 'image/png' })
}

function gifFile(name = 'renamed.png') {
  return new File([GIF_BYTES], name, { type: 'image/png' })
}

function rateAllCategories() {
  const labels = [
    'Rate the service: 5 of 5',
    'Rate the products: 5 of 5',
    'Rate the staff customer service: 5 of 5',
    'Rate the time management: 5 of 5',
  ]
  for (const label of labels) fireEvent.click(screen.getByRole('radio', { name: label }))
}

function chooseFiles(files) {
  fireEvent.change(screen.getByLabelText('Add photo'), { target: { files } })
}

function renderForm(overrides = {}) {
  return render(
    <ReviewForm appointmentId="a1" onDone={vi.fn()} onSuccess={vi.fn()} {...overrides} />,
  )
}

beforeEach(() => {
  submitReviewRequest.mockReset()
  uploadReviewPhoto.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

afterEach(cleanup)

describe('ReviewForm photo flow', () => {
  it('validates photo type and size before any upload', async () => {
    renderForm()
    chooseFiles([gifFile('renamed.png'), new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'big.png', { type: 'image/png' })])

    await waitFor(() => {
      expect(screen.getByText(/renamed\.png: Photos must be PNG or JPG images\./)).toBeTruthy()
    })
    expect(screen.getByText(/big\.png: Photos must be 10 MB or smaller\./)).toBeTruthy()
    expect(screen.queryByAltText(/preview/)).toBeNull()

    rateAllCategories()
    submitReviewRequest.mockResolvedValue({ review: { id: 'r9', overallRating: 5 } })
    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT REVIEW' }))

    await waitFor(() => expect(submitReviewRequest).toHaveBeenCalledTimes(1))
    expect(uploadReviewPhoto).not.toHaveBeenCalled()
  })

  it('caps chosen photos at 3 with an inline message', async () => {
    renderForm()
    chooseFiles([pngFile('one.png'), pngFile('two.png'), pngFile('three.png'), pngFile('four.png')])

    await waitFor(() => expect(screen.getAllByAltText(/preview/)).toHaveLength(3))
    expect(screen.getByText(/four\.png: a review can have at most 3 photos\./)).toBeTruthy()
  })

  it('shows previews with a remove button per photo', async () => {
    renderForm()
    chooseFiles([pngFile('one.png'), pngFile('two.png')])
    await waitFor(() => expect(screen.getAllByAltText(/preview/)).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }))
    await waitFor(() => expect(screen.getAllByAltText(/preview/)).toHaveLength(1))
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('submits the review first, uploads photos one by one, and never resubmits the review on retry', async () => {
    let midFailed = false
    uploadReviewPhoto.mockImplementation((reviewId, file) => {
      if (file.name === 'mid.png' && !midFailed) {
        midFailed = true
        return Promise.reject(new ConflictError('A review can have at most 3 photos'))
      }
      return Promise.resolve({ photo: { id: `p-${file.name}`, position: 1, url: `/uploads/${file.name}` } })
    })
    submitReviewRequest.mockResolvedValue({ review: { id: 'r9', overallRating: 5, comment: '' } })
    const onSuccess = vi.fn()

    renderForm({ onSuccess })
    chooseFiles([pngFile('first.png'), pngFile('mid.png'), pngFile('last.png')])
    await waitFor(() => expect(screen.getAllByAltText(/preview/)).toHaveLength(3))

    rateAllCategories()
    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT REVIEW' }))

    // The review is saved first, then photos upload one by one (in order).
    await waitFor(() => expect(submitReviewRequest).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(uploadReviewPhoto).toHaveBeenCalledTimes(3))
    expect(uploadReviewPhoto.mock.calls.map((call) => call[1].name)).toEqual(['first.png', 'mid.png', 'last.png'])
    expect(uploadReviewPhoto.mock.calls[0][0]).toBe('r9')
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(onSuccess.mock.calls[0][1]).toEqual({ photoPhase: true })

    // The saved review stays saved; the failed photo keeps its preview.
    expect(screen.getByText(/Thank you — your review was saved\./)).toBeTruthy()
    expect(screen.getByText(/2 of 3 photos uploaded\. 1 failed/)).toBeTruthy()
    expect(screen.getByText('A review can have at most 3 photos')).toBeTruthy()
    expect(screen.getAllByAltText(/preview/)).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'REVIEW SAVED' }).disabled).toBe(true)

    // Per-photo retry re-uploads ONLY that photo — the review is never resubmitted.
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload of photo 2' }))
    await waitFor(() => expect(uploadReviewPhoto).toHaveBeenCalledTimes(4))
    expect(uploadReviewPhoto.mock.calls[3][1].name).toBe('mid.png')
    expect(submitReviewRequest).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByText('All 3 photos uploaded.')).toBeTruthy())
  })

  it('continues uploading the rest after a failure', async () => {
    uploadReviewPhoto.mockImplementation((reviewId, file) =>
      file.name === 'bad.png'
        ? Promise.reject(new ConflictError('A review can have at most 3 photos'))
        : Promise.resolve({ photo: { id: 'p', position: 1, url: '/uploads/p.png' } }),
    )
    submitReviewRequest.mockResolvedValue({ review: { id: 'r9', overallRating: 5 } })

    renderForm()
    chooseFiles([pngFile('bad.png'), pngFile('good.png')])
    await waitFor(() => expect(screen.getAllByAltText(/preview/)).toHaveLength(2))
    rateAllCategories()
    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT REVIEW' }))

    // Photo 2 still uploads although photo 1 failed.
    await waitFor(() => expect(uploadReviewPhoto).toHaveBeenCalledTimes(2))
    expect(uploadReviewPhoto.mock.calls.map((call) => call[1].name)).toEqual(['bad.png', 'good.png'])
    await waitFor(() => expect(screen.getByText(/1 of 2 photos uploaded\. 1 failed/)).toBeTruthy())
    expect(submitReviewRequest).toHaveBeenCalledTimes(1)
  })

  it('saves a review without photos exactly once', async () => {
    submitReviewRequest.mockResolvedValue({ review: { id: 'r9', overallRating: 5 } })
    const onSuccess = vi.fn()

    renderForm({ onSuccess })
    rateAllCategories()
    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT REVIEW' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(onSuccess.mock.calls[0][1]).toEqual({ photoPhase: false })
    expect(submitReviewRequest).toHaveBeenCalledTimes(1)
    expect(uploadReviewPhoto).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'REVIEW SAVED' }))
    expect(submitReviewRequest).toHaveBeenCalledTimes(1)
  })
})
