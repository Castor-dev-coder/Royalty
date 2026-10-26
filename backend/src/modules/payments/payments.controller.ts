import type { NextFunction, Request, Response } from 'express'
import type { AuthenticatedRequest } from '../../middleware/auth.js'
import { PaymentsService } from './payments.service.js'
import { processUpload, ImageRejectedError, MAX_UPLOAD_BYTES } from '../images/image-pipeline.js'
import * as storage from '../images/storage.js'
import { BadRequestError } from '../../errors/index.js'

function who(req: Request): { userId: string; role: string } {
  const user = (req as unknown as AuthenticatedRequest).user
  return { userId: user!.userId, role: user!.role }
}

async function storeProof(buffer: Buffer): Promise<{ url: string; storagePath: string }> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new BadRequestError('Attach a payment proof image (PNG or JPG).')
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new BadRequestError('The image is too large (10 MB maximum).')
  }
  const processed = await processUpload(buffer)
  const storagePath = await storage.uploadImage('payments', processed.format, processed.buffer)
  return { url: storage.publicUrlFor(storagePath), storagePath }
}

/** GET /payments/quote/:appointmentId — server-calculated amounts. */
export async function paymentQuoteController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: { quote: await PaymentsService.quote(String(req.params.appointmentId), who(req)) } })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /payments/:appointmentId/online — GCash online payment submission.
 * The proof image is the raw request body (magic bytes decide the type);
 * `option` (FULL|DOWN) and `referenceNo` ride in the query string and are
 * validated by the route. The stored proof is deleted again if the database
 * insert fails, so a rejected submission never leaves an orphaned file.
 */
export async function submitOnlinePaymentController(req: Request, res: Response, next: NextFunction): Promise<void> {
  let storedPath: string | null = null
  try {
    const actor = who(req)
    const { option, referenceNo } = req.query as { option: 'FULL' | 'DOWN'; referenceNo: string }
    const proof = await storeProof(req.body as Buffer)
    storedPath = proof.storagePath
    const payment = await PaymentsService.submitOnline(String(req.params.appointmentId), actor, {
      option,
      referenceNo,
      proofUrl: proof.url,
      proofStoragePath: proof.storagePath,
    })
    res.status(201).json({ data: { payment } })
  } catch (error) {
    if (storedPath) await storage.deleteObject(storedPath)
    if (error instanceof ImageRejectedError) {
      res.status(400).json({ error: { code: 'IMAGE_REJECTED', message: error.message } })
      return
    }
    next(error)
  }
}

/** GET /payments — admin/manager list (STAFF see their own appointments' rows). */
export async function listPaymentsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: await PaymentsService.listAll(who(req)) })
  } catch (error) {
    next(error)
  }
}

export async function listMyPaymentsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: await PaymentsService.listMine(who(req).userId) })
  } catch (error) {
    next(error)
  }
}

export async function paymentActivityController(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: await PaymentsService.activity() })
  } catch (error) {
    next(error)
  }
}

export async function updatePaymentStatusController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = req.body as { status: 'VERIFIED' | 'REJECTED' }
    const payment = await PaymentsService.setStatus(who(req), String(req.params.id), status)
    res.json({ data: { payment } })
  } catch (error) {
    next(error)
  }
}

export async function recordInPersonPaymentController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as { appointmentId: string; method: 'CASH' | 'GCASH'; amount: number; referenceNo?: string }
    const payment = await PaymentsService.recordInPerson(who(req), body)
    res.status(201).json({ data: { payment } })
  } catch (error) {
    next(error)
  }
}

/** GET /payments/settings — public GCash display + policy. */
export async function getPaymentSettingsController(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ data: { settings: await PaymentsService.getSettings() } })
  } catch (error) {
    next(error)
  }
}

export async function updatePaymentSettingsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await PaymentsService.updateSettings(who(req).userId, req.body ?? {})
    res.json({ data: { settings } })
  } catch (error) {
    next(error)
  }
}

/** POST /payments/settings/qr — ADMIN QR image upload (raw body). */
export async function uploadGcashQrController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = who(req)
    const body = req.body as Buffer
    if (!Buffer.isBuffer(body) || body.length === 0) throw new BadRequestError('Attach a QR image (PNG or JPG).')
    if (body.length > MAX_UPLOAD_BYTES) throw new BadRequestError('The image is too large (10 MB maximum).')
    const processed = await processUpload(body)
    const previous = await PaymentsService.getSettings()
    const storagePath = await storage.uploadImage('payments', processed.format, processed.buffer)
    if (previous.gcashQrUrl) {
      await storage.deletePreviousByUrl(previous.gcashQrUrl)
    }
    const settings = await PaymentsService.updateSettings(actor.userId, {
      gcashQrUrl: storage.publicUrlFor(storagePath),
      gcashQrStoragePath: storagePath,
    })
    res.status(201).json({ data: { settings } })
  } catch (error) {
    if (error instanceof ImageRejectedError) {
      res.status(400).json({ error: { code: 'IMAGE_REJECTED', message: error.message } })
      return
    }
    next(error)
  }
}
