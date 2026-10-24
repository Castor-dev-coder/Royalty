// salon-media bucket access (Supabase Storage, REST). The service-role key
// stays in backend/.env and is used only here — never exposed to the frontend.
// Public URLs are read-only; every write goes through the backend.
import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import type { ImageFormat } from './image-pipeline.js'

export const BUCKET = 'salon-media'
export type MediaKind = 'staff' | 'services'

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
