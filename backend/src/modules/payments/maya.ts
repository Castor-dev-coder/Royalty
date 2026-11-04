// Maya (PayMaya) checkout client — SANDBOX ONLY.
//
// Security rules enforced here:
//  - The base URL must be exactly the Maya sandbox host. Production hosts are
//    refused even when the keys look valid ("Maya sandbox only. Never contact
//    production.").
//  - Keys never appear in logs, errors, or thrown messages.
//  - Authentication is HTTP Basic with the secret key as username and an
//    empty password (the scheme the sandbox accepts — verified by the
//    security gate: an accepted-auth request returns 4xx on shape, 401 on a
//    bad key).
//
// Money rule: all amounts are integer centavos everywhere in the server.
// The wire amount is the same integer centavos figure Maya expects
// (`totalAmount.value`), so no money math ever touches a float.
import { env } from '../../config/env.js';

/** The one and only allowed Maya endpoint. */
export const MAYA_SANDBOX_BASE = 'https://pg-sandbox.paymaya.com';

export class MayaConfigError extends Error {}
export class MayaApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'MayaApiError';
  }
}

/**
 * The Maya hosted-checkout page for a checkout id — the exact pattern the
 * sandbox create response returns as `redirectUrl`.
 */
export function checkoutUrlFor(checkoutId: string): string {
  return `https://payments-web-sandbox.maya.ph/v2/checkout?id=${encodeURIComponent(checkoutId)}`;
}

/** Hard stop: refuse anything that is not the Maya sandbox host. */
export function requireSandboxBase(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized !== MAYA_SANDBOX_BASE) {
    throw new MayaConfigError(
      'Maya is configured to contact a non-sandbox host. Payment features are disabled until MAYA_BASE_URL is the Maya sandbox URL.',
    );
  }
  return normalized;
}

/**
 * Maya authenticates per operation (observed against the sandbox):
 *  - POST /checkout/v1/checkouts (create)  — Basic public:secret
 *  - GET  /checkout/v1/checkouts/{id}      — Basic secret:
 *  - GET  /payments/v1/payments/{id}       — Basic secret:
 * A wrong scheme for an operation returns 401 code K004 ("Invalid endpoint").
 */
export function requireMayaConfig(): { baseUrl: string; createAuth: string; retrieveAuth: string } {
  const baseUrl = requireSandboxBase(env.MAYA_BASE_URL);
  if (!env.MAYA_SECRET_KEY || !env.MAYA_PUBLIC_KEY) {
    throw new MayaConfigError('Maya API keys are not configured.');
  }
  const createAuth = `Basic ${Buffer.from(`${env.MAYA_PUBLIC_KEY}:${env.MAYA_SECRET_KEY}`).toString('base64')}`;
  const retrieveAuth = `Basic ${Buffer.from(`${env.MAYA_SECRET_KEY}:`).toString('base64')}`;
  return { baseUrl, createAuth, retrieveAuth };
}

// ---- money (integer centavos) --------------------------------------------

/** '1333.33' | 1333.33 | '450' -> integer centavos. No floats in the math. */
export function toCentavos(value: string | number): number {
  const raw = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new Error(`Unparseable money value: ${raw}`);
  const [, sign, whole, fractionRaw] = match;
  const fraction = (fractionRaw ?? '').slice(0, 2).padEnd(2, '0');
  const extraDigits = (fractionRaw ?? '').slice(2).replace(/0+$/, '');
  if (extraDigits.length > 0) throw new Error(`Money value has sub-centavo precision: ${raw}`);
  const centavos = Number(whole) * 100 + Number(fraction);
  return sign === '-' ? -centavos : centavos;
}

/** 13333 -> '133.33'. Decimal string with exactly two places. */
export function fromCentavos(centavos: number): string {
  const sign = centavos < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(centavos));
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * The wire amount Maya receives is a DECIMAL PESO figure (observed on the
 * sandbox checkout page: `value: 75000` renders as "PHP 75,000.00"). The
 * conversion parses the exact two-decimal string — no money arithmetic ever
 * touches a float.
 */
export function toWireAmount(centavos: number): number {
  return Number(fromCentavos(Math.trunc(centavos)));
}

/** Maya's amount strings ('750' / '750.00') come back as integer centavos. */
export function fromWireAmount(value: unknown): number {
  return toCentavos(String(value));
}

// ---- transport ------------------------------------------------------------

export interface MayaCheckoutCreateRequest {
  totalAmountCentavos: number;
  requestReferenceNumber: string;
  redirectUrl: { success: string; failure: string; cancel: string };
  metadata?: Record<string, string>;
}

export interface MayaCheckout {
  checkoutId: string;
  /** The hosted checkout page (from the create response pattern). */
  redirectUrl: string;
  /** Checkout lifecycle status (CREATED, PAYMENT_SUCCESS, ...). */
  status: string;
  /** Payment lifecycle status (PENDING_TOKEN, PAYMENT_SUCCESS, ...). */
  paymentStatus: string;
  paymentId: string | null;
  amountCentavos: number | null;
  currency: string | null;
  requestReferenceNumber: string | null;
}

export interface MayaPayment {
  paymentId: string;
  status: string;
  amountCentavos: number | null;
  currency: string | null;
}

export type MayaFetch = typeof fetch;

let fetchImpl: MayaFetch = globalThis.fetch.bind(globalThis);

/** Test seam only — never used in production code paths. */
export function setMayaFetchForTests(fn: MayaFetch | null): void {
  fetchImpl = fn ?? globalThis.fetch.bind(globalThis);
}

async function mayaRequest(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const { baseUrl, createAuth, retrieveAuth } = requireMayaConfig();
  const authHeader = (init?.method ?? 'GET') === 'POST' ? createAuth : retrieveAuth;
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      method: init?.method ?? 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    // Never leak the URL, keys, or request body in the error message.
    throw new MayaApiError(`Maya request failed: ${(error as Error).name || 'network error'}`, 0);
  }
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const code = typeof body.code === 'string' ? body.code : 'UNKNOWN';
    // Provider error codes only — never the payload.
    throw new MayaApiError(`Maya rejected the request (status ${response.status}, code ${code})`, response.status);
  }
  return body;
}

/** POST /checkout/v1/checkouts — create one sandbox checkout. */
export async function createCheckout(request: MayaCheckoutCreateRequest): Promise<MayaCheckout> {
  const body = await mayaRequest('/checkout/v1/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      totalAmount: { currency: 'PHP', value: toWireAmount(request.totalAmountCentavos) },
      requestReferenceNumber: request.requestReferenceNumber,
      redirectUrl: request.redirectUrl,
      ...(request.metadata ? { metadata: request.metadata } : {}),
    }),
  });
  const checkoutId = typeof body.checkoutId === 'string' ? body.checkoutId : '';
  const redirectUrl = typeof body.redirectUrl === 'string' ? body.redirectUrl : '';
  if (!checkoutId || !redirectUrl) {
    throw new MayaApiError('Maya returned a malformed checkout response', 0);
  }
  return {
    checkoutId,
    redirectUrl,
    status: typeof body.status === 'string' ? body.status : 'CREATED',
    paymentStatus: typeof body.paymentStatus === 'string' ? body.paymentStatus : '',
    paymentId: null,
    amountCentavos: null,
    currency: null,
    requestReferenceNumber: typeof body.requestReferenceNumber === 'string' ? body.requestReferenceNumber : null,
  };
}

/** GET /checkout/v1/checkouts/{id} — authoritative checkout state. */
export async function getCheckout(checkoutId: string): Promise<MayaCheckout> {
  const body = await mayaRequest(`/checkout/v1/checkouts/${encodeURIComponent(checkoutId)}`);
  // Real retrieve shape: totalAmount: { amount: '<centavos string>', currency }.
  const total = (body.totalAmount as { amount?: unknown; currency?: unknown } | undefined) ?? {};
  const details = (body.paymentDetails as { paymentId?: unknown } | undefined) ?? {};
  const amountRaw = total.amount ?? (body.amount as { value?: unknown } | undefined)?.value ?? null;
  return {
    checkoutId,
    redirectUrl: checkoutUrlFor(checkoutId),
    status: typeof body.status === 'string' ? body.status : 'UNKNOWN',
    paymentStatus: typeof body.paymentStatus === 'string' ? body.paymentStatus : '',
    paymentId: typeof body.paymentId === 'string' ? body.paymentId
      : typeof details.paymentId === 'string' ? details.paymentId : null,
    amountCentavos: amountRaw === null ? null : fromWireAmount(amountRaw),
    currency: typeof total.currency === 'string' ? total.currency : null,
    requestReferenceNumber: typeof body.requestReferenceNumber === 'string' ? body.requestReferenceNumber : null,
  };
}

/** GET /payments/v1/payments/{id} — authoritative settlement state. */
export async function getPayment(paymentId: string): Promise<MayaPayment> {
  const body = await mayaRequest(`/payments/v1/payments/${encodeURIComponent(paymentId)}`);
  const amountValue = (body.amount as { value?: unknown } | undefined)?.value ?? null;
  return {
    paymentId: typeof body.paymentId === 'string' ? body.paymentId : paymentId,
    status: typeof body.status === 'string' ? body.status : 'UNKNOWN',
    amountCentavos: amountValue === null ? null : fromWireAmount(amountValue),
    currency: (body.amount as { currency?: string } | undefined)?.currency ?? null,
  };
}

/**
 * Statuses meaning "the money is in". NOTE: the checkout SESSION
 * lifecycle reports COMPLETED for "the redirect flow finished" — an
 * abandoned checkout also reports COMPLETED (paired with
 * PAYMENT_CANCELLED), so COMPLETED is not a payment state and must never
 * credit money.
 */
export const MAYA_SUCCESS_STATUSES = new Set(['PAYMENT_SUCCESS', 'SUCCESS']);
export const MAYA_FAILURE_STATUSES = new Set(['PAYMENT_FAILED', 'FAILED']);
export const MAYA_EXPIRED_STATUSES = new Set(['PAYMENT_EXPIRED', 'EXPIRED']);
/** The customer left the payment page without paying: terminal, never credited. */
export const MAYA_CANCELLED_STATUSES = new Set(['PAYMENT_CANCELLED', 'CANCELLED']);
