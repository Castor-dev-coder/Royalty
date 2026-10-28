// Maya checkout endpoints (customer payment flow).
//
// POST /payments/maya/checkout  — CUSTOMER: start one payment attempt
// GET  /payments/maya/return    — PUBLIC: the Maya redirect target
// POST /payments/maya/webhook   — PUBLIC: provider callback (never trusted)
// GET  /payments/maya/:id/status— authenticated: authoritative state
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.js';
import { z } from 'zod';
import { MayaPaymentsService } from './maya.service.js';

export const mayaCheckoutSchema = z.object({
  appointmentId: z.string().uuid(),
  plan: z.enum(['FULL', 'DOWN']),
  attemptToken: z.string().trim().min(8).max(100),
});

export const mayaReturnSchema = z.object({
  payment: z.string().uuid(),
  attempt: z.string().trim().min(8).max(100),
});

function who(req: Request): { userId: string; role: string } {
  const user = (req as unknown as AuthenticatedRequest).user;
  return { userId: user!.userId, role: user!.role };
}

/** POST /payments/maya/checkout — create the attempt + hold + sandbox checkout. */
export async function mayaCheckoutController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as z.infer<typeof mayaCheckoutSchema>;
    const payment = await MayaPaymentsService.createCheckoutAttempt(who(req), {
      appointmentId: input.appointmentId,
      plan: input.plan,
      attemptToken: input.attemptToken,
    });
    res.status(201).json({ data: { payment } });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /payments/maya/return — where Maya sends the browser back. The outcome
 * query hint is display-only: the response comes from the authoritative
 * server-side verification against the Maya API.
 */
export async function mayaReturnController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as Record<string, unknown>;
    const parsed = mayaReturnSchema.safeParse({ payment: query.payment, attempt: query.attempt });
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payment return link' } });
      return;
    }
    const outcome = await MayaPaymentsService.verifyPayment(parsed.data.payment, null);
    res.json({ data: { payment: outcome.view, outcome: outcome.state } });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /payments/maya/webhook — provider callback. The body only names the
 * payment; every money decision is re-verified against the Maya API.
 */
export async function mayaWebhookController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const result = await MayaPaymentsService.processWebhook(payload);
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

/** GET /payments/maya/:id/status — authoritative state for polling/displays. */
export async function mayaStatusController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payment = await MayaPaymentsService.statusFor(String(req.params.id), who(req));
    res.json({ data: { payment } });
  } catch (error) {
    next(error);
  }
}
