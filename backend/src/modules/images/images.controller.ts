// Upload endpoints for staff photos and service images (ADMIN/MANAGER).
import type { NextFunction, Request, Response } from 'express'
import { ImageRejectedError, setServiceImage, setStaffPhoto } from './images.service.js'

function respond(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ImageRejectedError) {
    res.status(400).json({ error: { code: 'IMAGE_REJECTED', message: error.message } })
    return
  }
  next(error)
}

function bodyBuffer(req: Request): Buffer {
  return Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
}

export async function uploadStaffPhotoController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await setStaffPhoto(String(req.params.id), bodyBuffer(req))
    res.status(200).json({ data: result })
  } catch (error) {
    respond(error, res, next)
  }
}

export async function uploadServiceImageController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await setServiceImage(String(req.params.id), bodyBuffer(req))
    res.status(200).json({ data: result })
  } catch (error) {
    respond(error, res, next)
  }
}
