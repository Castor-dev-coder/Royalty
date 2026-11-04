// Customer review photos (max 3 per review, enforced by the database).
//
// Uploads reuse the image pipeline (PNG/JPG by magic bytes; SVG, GIF, WebP,
// HEIC and renamed files are rejected; EXIF/GPS stripped; size and pixel
// caps). Files live under salon-media/reviews/ with random server-made names.
// If the database insert fails the stored file is deleted again.
//
// Visible-only reads: hidden photos never appear in any public or customer
// response. Storage paths are never exposed — only { position, url }.
import { db } from '../../prisma/db.js'
import { pgVarchar } from '../../prisma/contract-compat.js'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js'
import { processUpload, ImageRejectedError, MAX_UPLOAD_BYTES } from '../images/image-pipeline.js'
import * as defaultStorage from '../images/storage.js'
import { generateAuditLog } from '../../utils/audit.js'

export interface ReviewPhotoInfo {
  id: string
  position: number
  url: string
  hidden?: boolean
}

/** Storage port: real by default, injectable for tests. */
export interface ReviewPhotoStorage {
  uploadImage: (kind: 'reviews', format: 'png' | 'jpeg', buffer: Buffer) => Promise<string>
  deleteObject: (path: string) => Promise<void>
  publicUrlFor: (path: string) => string
}

const MAX_PHOTOS = 3

function toInfo(row: Record<string, unknown>, includeHidden = false): ReviewPhotoInfo {
  const info: ReviewPhotoInfo = {
    id: String(row.id),
    position: Number(row.position),
    url: String(row.url),
  }
  if (includeHidden) info.hidden = Boolean(row.hidden)
  return info
}

export class ReviewPhotosService {
  /**
   * POST /reviews/:id/photos — owner customer only (404 for anyone else),
   * one file per request, lowest free position, 409 when three exist.
   */
  static async upload(
    reviewId: string,
    userId: string,
    role: string,
    input: Buffer,
    storage: ReviewPhotoStorage = defaultStorage as unknown as ReviewPhotoStorage,
  ): Promise<ReviewPhotoInfo> {
    if (role !== 'CUSTOMER') {
      throw new ForbiddenError('Only customers can upload review photos')
    }
    const customer = await db.orm.public.Customer.where({ accountId: userId }).first()
    const review = await db.orm.public.Review.where({ id: reviewId }).first()
    // Ownership is never leaked: a review that is not yours looks the same as
    // one that does not exist.
    if (!review || !customer || String(review.customerId) !== String(customer.id)) {
      throw new NotFoundError('Review not found')
    }

    const existing = await db.orm.public.ReviewPhoto.where({ reviewId }).all()
    if (existing.length >= MAX_PHOTOS) {
      throw new ConflictError('A review can have at most 3 photos')
    }
    const taken = new Set(existing.map((row) => Number(row.position)))
    const position = [1, 2, 3].find((candidate) => !taken.has(candidate)) ?? MAX_PHOTOS

    if (!Buffer.isBuffer(input) || input.length === 0) {
      throw new BadRequestError('Only PNG and JPG images are allowed (the file type is checked from its content).')
    }
    if (input.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestError('The image is too large (10 MB maximum).')
    }
    // Throws ImageRejectedError for anything that is not a real PNG/JPG.
    const processed = await processUpload(input)

    const path = await storage.uploadImage('reviews', processed.format, processed.buffer)
    try {
      const row = await db.orm.public.ReviewPhoto.create({
        reviewId,
        position,
        storagePath: pgVarchar<500>(path),
        url: pgVarchar<500>(storage.publicUrlFor(path)),
        hidden: false,
      })
      return toInfo(row)
    } catch (error) {
      // Never leave an orphaned object behind when the insert fails.
      await storage.deleteObject(path)
      throw error
    }
  }

  /** PATCH /reviews/:id/photos/:photoId — ADMIN/MANAGER hide/unhide, audited. */
  static async setHidden(
    userId: string,
    role: string,
    reviewId: string,
    photoId: string,
    hidden: boolean,
  ): Promise<ReviewPhotoInfo> {
    if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenError('Only managers and admins can hide review photos')
    }
    const photo = await db.orm.public.ReviewPhoto.where({ id: photoId, reviewId }).first()
    if (!photo) throw new NotFoundError('Photo not found')

    const updated = await db.orm.public.ReviewPhoto.where({ id: photoId }).update({ hidden })
    await generateAuditLog({
      actorAccountId: userId,
      action: hidden ? 'HIDE_REVIEW_PHOTO' : 'UNHIDE_REVIEW_PHOTO',
      entityType: 'ReviewPhoto',
      entityId: photoId,
      oldData: { hidden: Boolean(photo.hidden) },
      newData: { hidden },
    })
    return toInfo(updated ?? photo, true)
  }

  /** Visible photos for one review: { position, url } only. */
  static async visiblePhotos(reviewId: string): Promise<Array<{ position: number; url: string }>> {
    const rows = await db.orm.public.ReviewPhoto.where({ reviewId }).all()
    return rows
      .filter((row) => !row.hidden)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((row) => ({ position: Number(row.position), url: String(row.url) }))
  }
}

export { ImageRejectedError }
