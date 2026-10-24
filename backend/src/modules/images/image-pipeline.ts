// Image pipeline for staff photos and service images.
//
// Input: PNG and JPG ONLY, decided by magic bytes (a renamed file is rejected
// by its bytes, never by its name). SVG, GIF, WebP and HEIC are rejected with
// specific messages. Processing: sharp auto-rotates from EXIF, strips all
// metadata (EXIF/GPS), fits within 1200px, and re-encodes toward ~1 MB with a
// hard 5 MB ceiling. Decoding is capped by an input-pixel limit so a crafted
// file cannot become a decompression bomb.
import sharp from 'sharp'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB input cap
export const MAX_OUTPUT_BYTES = 5 * 1024 * 1024 // never store above 5 MB
export const TARGET_OUTPUT_BYTES = 1024 * 1024 // ~1 MB re-encode target
export const MAX_DIMENSION = 1200 // longest edge after resize
export const MAX_INPUT_PIXELS = 40_000_000 // decode-bomb guard (40 MP)

export type ImageFormat = 'png' | 'jpeg'

export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageRejectedError'
  }
}

/**
 * Magic-byte sniffing. The filename is deliberately never consulted: a
 * renamed .exe or .svg carries its true type in its first bytes.
 */
export function sniffImageFormat(buffer: Buffer): ImageFormat {
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  if (isPng) return 'png'
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (isJpeg) return 'jpeg'

  const head = buffer.subarray(0, 12)
  const asText = buffer.subarray(0, 256).toString('latin1').toLowerCase()
  if (asText.includes('<svg') || asText.trimStart().startsWith('<?xml')) {
    throw new ImageRejectedError('SVG files are not allowed. Upload a PNG or JPG image.')
  }
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) {
    throw new ImageRejectedError('GIF files are not allowed. Upload a PNG or JPG image.')
  }
  if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') {
    throw new ImageRejectedError('WebP files are not allowed. Upload a PNG or JPG image.')
  }
  if (head.toString('latin1', 4, 8) === 'ftyp') {
    throw new ImageRejectedError('HEIC files are not allowed. Upload a PNG or JPG image.')
  }
  throw new ImageRejectedError('Only PNG and JPG images are allowed (the file type is checked from its content).')
}

export interface ProcessedImage {
  buffer: Buffer
  contentType: string
  format: ImageFormat
}

/**
 * Validate + normalize one upload. Never throws sharp internals at callers:
 * every rejection is an ImageRejectedError with a message fit for a UI.
 */
export async function processUpload(input: Buffer): Promise<ProcessedImage> {
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new ImageRejectedError('The image is larger than the 10 MB upload limit.')
  }
  if (input.length === 0) {
    throw new ImageRejectedError('The upload is empty.')
  }
  const format = sniffImageFormat(input)

  let width = 0
  let height = 0
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0
  } catch {
    throw new ImageRejectedError('The image could not be read (corrupt or too many pixels).')
  }
  if (width === 0 || height === 0 || width * height > MAX_INPUT_PIXELS) {
    throw new ImageRejectedError('The image has too many pixels to process.')
  }

  // .rotate() applies the EXIF orientation and then drops it; nothing else is
  // copied to the output, so EXIF (including GPS) never reaches storage.
  const base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })

  let best: Buffer | null = null
  if (format === 'jpeg') {
    for (const quality of [82, 72, 62, 52]) {
      const out = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer()
      best = out
      if (out.length <= TARGET_OUTPUT_BYTES) break
    }
  } else {
    for (const settings of [
      { compressionLevel: 9, palette: false },
      { compressionLevel: 9, palette: true, quality: 80 },
      { compressionLevel: 9, palette: true, quality: 60 },
    ] as const) {
      const out = await base.clone().png(settings as never).toBuffer()
      best = out
      if (out.length <= TARGET_OUTPUT_BYTES) break
    }
  }

  const buffer = best ?? Buffer.alloc(0)
  if (buffer.length > MAX_OUTPUT_BYTES) {
    throw new ImageRejectedError('The image could not be compressed below the 5 MB storage limit.')
  }
  return {
    buffer,
    contentType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    format,
  }
}
