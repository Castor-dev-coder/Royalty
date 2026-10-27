// salon-media bucket access (Supabase Storage, REST). The service-role key
// stays in backend/.env and is used only here — never exposed to the frontend.
// Public URLs are read-only; every write goes through the backend.
import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import type { ImageFormat } from './image-pipeline.js'

export const BUCKET = 'salon-media'
export type MediaKind = 'staff' | 'services' | 'reviews' | 'payments'

const base = (): string => {
  if (!env.SUPABASE_URL) throw new Error('SUPABASE_URL is not configured')
  return env.SUPABASE_URL.replace(/\/+$/, '')
}

const authHeaders = (): Record<string, string> => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

export function publicUrlFor(path: string): string {
  return `${base()}/storage/v1/object/public/${BUCKET}/${path}`
}

/** Recover the object path from a stored public URL (for delete-on-replace). */
export function objectPathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const index = url.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.slice(index + marker.length))
}

/** Random server-made filename under staff/ or services/. */
export async function uploadImage(kind: MediaKind, format: ImageFormat, buffer: Buffer): Promise<string> {
  const path = `${kind}/${randomUUID()}.${format === 'jpeg' ? 'jpg' : 'png'}`
  const response = await fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': format === 'jpeg' ? 'image/jpeg' : 'image/png',
      'x-upsert': 'false',
    },
    body: new Uint8Array(buffer),
  })
  if (!response.ok) {
    throw new Error(`Image storage upload failed (HTTP ${response.status}).`)
  }
  return path
}

/** Delete by exact object path. A missing object is not an error. */
export async function deleteObject(path: string): Promise<void> {
  const response = await fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`Image storage delete failed (HTTP ${response.status}).`)
  }
}

/** Delete the previous file behind a stored public URL (replace flow). */
export async function deletePreviousByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return
  const path = objectPathFromUrl(url)
  if (path) await deleteObject(path)
}

// --- payment proofs: private bucket, short-lived signed URLs ----------------
// Proofs live ONLY in the private `payment-proofs` bucket. The app stores the
// object path (never a public URL) and mints signed read URLs after a
// server-side role check. The QR image stays in `salon-media` above.

export const PROOFS_BUCKET = 'payment-proofs'
export const PROOF_URL_TTL_SECONDS = 120 // inside the approved 60–300 s window

/** Proofs may upload only while payment-proofs exists AND is private. */
export async function assertProofsBucket(): Promise<void> {
  // Bucket routes are singular (/storage/v1/bucket/:id); the plural /buckets
  // path is unrouted and 404s as "Route GET:/buckets/... not found".
  const response = await fetch(`${base()}/storage/v1/bucket/${PROOFS_BUCKET}`, { headers: authHeaders() })
  if (response.status === 404) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null
    if (detail?.message?.startsWith('Route ')) {
      throw new Error('Payment proofs are unavailable: the storage bucket endpoint answered 404 for its own route (check SUPABASE_URL and the storage API path).')
    }
    throw new Error(`Payment proofs are unavailable: the "${PROOFS_BUCKET}" bucket does not exist.`)
  }
  if (!response.ok) {
    throw new Error(`Payment proofs are unavailable (HTTP ${response.status}).`)
  }
  const bucket = (await response.json()) as { public?: boolean }
  if (bucket.public) {
    throw new Error(`Payment proofs are unavailable: the "${PROOFS_BUCKET}" bucket must be private.`)
  }
}

/** Upload a processed proof into the private bucket. Returns the object path. */
export async function uploadProof(format: ImageFormat, buffer: Buffer): Promise<string> {
  await assertProofsBucket()
  const path = `payments/${randomUUID()}.${format === 'jpeg' ? 'jpg' : 'png'}`
  const response = await fetch(`${base()}/storage/v1/object/${PROOFS_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': format === 'jpeg' ? 'image/jpeg' : 'image/png',
      'x-upsert': 'false',
    },
    body: new Uint8Array(buffer),
  })
  if (!response.ok) {
    throw new Error(`Payment proof upload failed (HTTP ${response.status}).`)
  }
  return path
}

/** Short-lived signed read URL for one proof (60–300 s window). */
export async function signedProofUrl(path: string): Promise<string> {
  // Encode each segment only: an encoded slash (%2F) between segments makes
  // the storage service compute a signature over a different path than the
  // one its own signed URL fetches (InvalidSignature on GET).
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${base()}/storage/v1/object/sign/${PROOFS_BUCKET}/${encodedPath}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: PROOF_URL_TTL_SECONDS }),
  })
  if (!response.ok) {
    throw new Error(`Payment proof link could not be created (HTTP ${response.status}).`)
  }
  const data = (await response.json()) as { signedURL?: string; signedUrl?: string }
  const signed = data.signedURL ?? data.signedUrl ?? ''
  if (!signed) throw new Error('Payment proof link could not be created.')
  return signed.startsWith('http') ? signed : `${base()}/storage/v1${signed}`
}

/** Delete a proof by exact object path. A missing object is not an error. */
export async function deleteProof(path: string): Promise<void> {
  const response = await fetch(`${base()}/storage/v1/object/${PROOFS_BUCKET}/${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`Payment proof delete failed (HTTP ${response.status}).`)
  }
}
