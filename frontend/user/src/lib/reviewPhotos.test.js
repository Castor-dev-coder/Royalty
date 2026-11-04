import { File } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  MAX_PHOTO_BYTES,
  photoAltText,
  photoFailureMessage,
  sniffImageMime,
  sortPhotos,
  validatePhotoFile,
} from './reviewPhotos.js'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01])
const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
const WEBP_BYTES = new TextEncoder().encode('RIFF\x00\x00\x00\x00WEBPVP8 ')
const HEIC_BYTES = new TextEncoder().encode('\x00\x00\x00\x20ftypheic')

function fileFrom(bytes, name, type = 'application/octet-stream') {
  return new File([bytes], name, { type })
}

describe('sniffImageMime', () => {
  it('accepts PNG magic bytes', () => {
    expect(sniffImageMime(PNG_BYTES)).toBe('image/png')
  })

  it('accepts JPEG magic bytes', () => {
    expect(sniffImageMime(JPEG_BYTES)).toBe('image/jpeg')
  })

  it('rejects GIF, SVG, WebP, HEIC and empty payloads', () => {
    expect(sniffImageMime(GIF_BYTES)).toBeNull()
    expect(sniffImageMime(SVG_BYTES)).toBeNull()
    expect(sniffImageMime(WEBP_BYTES)).toBeNull()
    expect(sniffImageMime(HEIC_BYTES)).toBeNull()
    expect(sniffImageMime(new Uint8Array(0))).toBeNull()
    expect(sniffImageMime(null)).toBeNull()
  })
})

describe('validatePhotoFile', () => {
  it('accepts a real PNG even when the name and reported type lie', async () => {
    const result = await validatePhotoFile(fileFrom(PNG_BYTES, 'actually-a-gif.gif', 'image/gif'))
    expect(result).toEqual({ ok: true, mime: 'image/png' })
  })

  it('accepts a real JPEG', async () => {
    const result = await validatePhotoFile(fileFrom(JPEG_BYTES, 'pic.jpg', 'image/jpeg'))
    expect(result).toEqual({ ok: true, mime: 'image/jpeg' })
  })

  it('rejects a renamed non-PNG/JPG by magic bytes, not by extension', async () => {
    const result = await validatePhotoFile(fileFrom(GIF_BYTES, 'sneaky.png', 'image/png'))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Photos must be PNG or JPG images.')
  })

  it('rejects SVG payloads', async () => {
    const result = await validatePhotoFile(fileFrom(SVG_BYTES, 'vector.jpg', 'image/jpeg'))
    expect(result.ok).toBe(false)
  })

  it('rejects files over 10 MB', async () => {
    const big = fileFrom(new Uint8Array(MAX_PHOTO_BYTES + 1), 'big.png', 'image/png')
    const result = await validatePhotoFile(big)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Photos must be 10 MB or smaller.')
  })

  it('accepts a file exactly at 10 MB (only the header is read)', async () => {
    const bytes = new Uint8Array(MAX_PHOTO_BYTES)
    bytes.set(PNG_BYTES, 0)
    const result = await validatePhotoFile(fileFrom(bytes, 'edge.png', 'image/png'))
    expect(result.ok).toBe(true)
  })

  it('rejects missing files', async () => {
    expect((await validatePhotoFile(null)).ok).toBe(false)
    expect((await validatePhotoFile({ size: 10 })).ok).toBe(false)
  })
})

describe('photoAltText', () => {
  it('uses the customer initials convention: Photo N of M from <initials> review', () => {
    expect(photoAltText({ index: 0, count: 3, name: 'Jane Doe' })).toBe("Photo 1 of 3 from JD's review")
    expect(photoAltText({ index: 2, count: 3, name: 'Jane Doe' })).toBe("Photo 3 of 3 from JD's review")
  })

  it('falls back to `a customer` when the API exposes no reviewer name', () => {
    expect(photoAltText({ index: 1, count: 2, name: undefined })).toBe("Photo 2 of 2 from a customer's review")
    expect(photoAltText({ index: 0, count: 1, name: '   ' })).toBe("Photo 1 of 1 from a customer's review")
    expect(photoAltText({ index: 0, count: 1, name: null })).toBe("Photo 1 of 1 from a customer's review")
  })
})

describe('sortPhotos', () => {
  it('orders photos by assigned position', () => {
    const sorted = sortPhotos([
      { position: 3, url: '/c.png' },
      { position: 1, url: '/a.png' },
      { position: 2, url: '/b.png' },
    ])
    expect(sorted.map((photo) => photo.position)).toEqual([1, 2, 3])
    expect(sortPhotos(undefined)).toEqual([])
  })
})

describe('photoFailureMessage', () => {
  it('names the rate limit and keeps server messages', () => {
    expect(photoFailureMessage({ status: 429, message: 'x' })).toContain('10 per hour')
    expect(photoFailureMessage({ status: 400, message: 'IMAGE_REJECTED' })).toBe('IMAGE_REJECTED')
    expect(photoFailureMessage(new Error('boom'))).toBe('boom')
    expect(photoFailureMessage(null)).toBe('Could not upload this photo. Try again.')
  })
})
