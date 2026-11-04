// Image use-cases for staff photos and service images: validate, normalize,
// upload to salon-media, delete the replaced file, then persist the public URL.
// ADMIN/MANAGER only (enforced at the route). Data-access stays in the ORM
// layer; storage I/O lives in ./storage.js.
import { db } from '../../prisma/db.js'
import { pgVarchar } from '../../prisma/contract-compat.js'
import { NotFoundError } from '../../errors/index.js'
import { ImageRejectedError, processUpload } from './image-pipeline.js'
import { deletePreviousByUrl, publicUrlFor, uploadImage, type MediaKind } from './storage.js'

export { ImageRejectedError }

async function replaceStoredImage(
  kind: MediaKind,
  input: Buffer,
  previousUrl: string | null,
): Promise<string> {
  const processed = await processUpload(input)
  const path = await uploadImage(kind, processed.format, processed.buffer)
  await deletePreviousByUrl(previousUrl)
  return publicUrlFor(path)
}

/** POST /staff/:id/photo — replace a staff member's photo. */
export async function setStaffPhoto(staffId: string, input: Buffer): Promise<{ photoUrl: string }> {
  const staff = await db.orm.public.Staff.where({ id: staffId }).first()
  if (!staff) throw new NotFoundError('Staff member not found')
  const photoUrl = await replaceStoredImage('staff', input, staff.photoUrl ?? null)
  await db.orm.public.Staff.where({ id: staffId }).update({ photoUrl: pgVarchar<500>(photoUrl) })
  return { photoUrl }
}

/** POST /services/:id/image — replace a service's image. */
export async function setServiceImage(serviceId: string, input: Buffer): Promise<{ imageUrl: string }> {
  const service = await db.orm.public.Service.where({ id: serviceId }).first()
  if (!service) throw new NotFoundError('Service not found')
  const imageUrl = await replaceStoredImage('services', input, service.imageUrl ?? null)
  await db.orm.public.Service.where({ id: serviceId }).update({ imageUrl: pgVarchar<500>(imageUrl) })
  return { imageUrl }
}
