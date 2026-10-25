import type { NextFunction, Request, Response } from 'express'
import { ReviewPhotosService, ImageRejectedError } from './photos.service.js'
import type { AuthenticatedRequest } from '../../middleware/auth.js'

function who(req: Request): { userId: string; role: string } {
  const user = (req as unknown as AuthenticatedRequest).user
  return { userId: user!.userId, role: user!.role }
}

/** POST /reviews/:id/photos — raw body (magic bytes decide the type). */
export async function uploadReviewPhotoController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = who(req)
    const body = req.body as Buffer
    const photo = await ReviewPhotosService.upload(String(req.params.id), userId, role, body)
    res.status(201).json({ data: { photo } })
  } catch (error) {
    if (error instanceof ImageRejectedError) {
      res.status(400).json({ error: { code: 'IMAGE_REJECTED', message: error.message } })
      return
    }
    next(error)
  }
}

/** PATCH /reviews/:id/photos/:photoId — hide/unhide (ADMIN/MANAGER). */
export async function setReviewPhotoHiddenController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = who(req)
    const hidden = Boolean((req.body as { hidden?: boolean }).hidden)
    const photo = await ReviewPhotosService.setHidden(userId, role, String(req.params.id), String(req.params.photoId), hidden)
    res.status(200).json({ data: { photo } })
  } catch (error) {
    next(error)
  }
}
