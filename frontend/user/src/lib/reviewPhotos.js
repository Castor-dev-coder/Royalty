// Review-photo helpers shared by the review form (upload validation) and the
// review cards (thumbnail alt text). Photo drafts and previews stay in memory
// only — nothing here ever touches web storage.

import { initialsFor } from './initials.js'

export const MAX_PHOTOS = 3
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 10 MB

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const SNIFF_BYTES = PNG_SIGNATURE.length

const TYPE_ERROR = 'Photos must be PNG or JPG images.'
const SIZE_ERROR = 'Photos must be 10 MB or smaller.'

/**
 * Content-Type decided from the file's MAGIC BYTES only — never from the
 * name, extension, or the browser-reported MIME type (all trivially spoofed).
 * PNG -> 'image/png', JPEG -> 'image/jpeg', anything else -> null.
 */
export function sniffImageMime(bytes) {
  if (!bytes || bytes.length < 3) return null
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return null
}

/** Client-side gate that runs BEFORE any upload: size <= 10 MB, PNG/JPG magic bytes. */
export async function validatePhotoFile(file) {
  if (!file || typeof file.slice !== 'function') return { ok: false, error: TYPE_ERROR }
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: SIZE_ERROR }
  let bytes
  try {
    bytes = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer())
  } catch {
    return { ok: false, error: TYPE_ERROR }
  }
  const mime = sniffImageMime(bytes)
  if (!mime) return { ok: false, error: TYPE_ERROR }
  return { ok: true, mime }
}

/** In-memory object URL for a draft preview (never localStorage). */
export function makePreviewUrl(file) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return ''
  return URL.createObjectURL(file)
}

/** Photos render in their assigned position order. */
export function sortPhotos(photos) {
  return [...(photos ?? [])].sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0))
}

/**
 * `Photo N of M from <initials>'s review` (1-based N). When the API exposes
 * no reviewer name the fallback word is `a customer` — identity is invented
 * nowhere.
 */
export function photoAltText({ index, count, name }) {
  const who = String(name ?? '').trim() ? initialsFor(name) : 'a customer'
  return `Photo ${index + 1} of ${count} from ${who}'s review`
}

/** Human message for a failed photo upload (per-photo, review is kept). */
export function photoFailureMessage(error) {
  if (error?.status === 429) return 'Too many photo uploads (10 per hour). Try again later.'
  const message = String(error?.message ?? '').trim()
  return message || 'Could not upload this photo. Try again.'
}
