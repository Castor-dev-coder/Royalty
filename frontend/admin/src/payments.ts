/**
 * Payment records as the admin and staff areas read them.
 *
 * Every peso figure here is a server value, moved and labelled only. The
 * browser never adds, subtracts, or derives money: the appointment total,
 * the verified total and the outstanding balance each arrive as their own
 * field from the API, and this module only maps, validates and formats them.
 */

import { isValidAmount, POSITIVE_AMOUNT_MESSAGE } from './shared/validation';

export { POSITIVE_AMOUNT_MESSAGE };

export type PaymentMethod = 'CASH' | 'GCASH';
export type PaymentChannel = 'ONLINE' | 'IN_PERSON';
export type PaymentStatus = 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
export type DownPaymentKind = 'NONE' | 'FIXED' | 'PERCENT';

/** One payment transaction row as the payments pages render it. */
export interface PaymentRow {
  id: string;
  appointmentId: string;
  appointmentCode: string;
  customerName: string;
  customerEmail: string;
  serviceName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  channel: PaymentChannel;
  status: PaymentStatus;
  referenceNo: string | null;
  proofUrl: string | null;
  bookingStatus: string;
  recordedBy: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  /** Server figures for the appointment this payment belongs to. */
  appointmentTotal: number;
  verifiedTotal: number;
  outstanding: number;
}

/** Map one API payment record to the row the payments pages render. */
export function toPaymentRow(raw: any): PaymentRow {
  const method = String(raw?.paymentMethod ?? '').toUpperCase();
  const channel = String(raw?.channel ?? '').toUpperCase();
  const status = String(raw?.status ?? '').toUpperCase();
  return {
    id: String(raw?.id ?? ''),
    appointmentId: String(raw?.appointmentId ?? ''),
    appointmentCode: String(raw?.appointmentCode ?? ''),
    customerName: String(raw?.customerName ?? 'Customer'),
    customerEmail: String(raw?.customerEmail ?? ''),
    serviceName: String(raw?.serviceName ?? 'Salon appointment'),
    amount: Number(raw?.amount ?? 0),
    paymentMethod: method === 'GCASH' ? 'GCASH' : 'CASH',
    channel: channel === 'ONLINE' ? 'ONLINE' : 'IN_PERSON',
    status: status === 'VERIFIED' ? 'VERIFIED' : status === 'REJECTED' ? 'REJECTED' : 'UNVERIFIED',
    referenceNo: raw?.referenceNo ? String(raw.referenceNo) : null,
    proofUrl: raw?.proofUrl ? String(raw.proofUrl) : null,
    bookingStatus: String(raw?.bookingStatus ?? 'RESERVED'),
    recordedBy: raw?.recordedBy ? String(raw.recordedBy) : null,
    verifiedBy: raw?.verifiedBy ? String(raw.verifiedBy) : null,
    verifiedAt: raw?.verifiedAt ? String(raw.verifiedAt) : null,
    createdAt: String(raw?.createdAt ?? ''),
    appointmentTotal: Number(raw?.appointmentTotal ?? 0),
    verifiedTotal: Number(raw?.verifiedTotal ?? 0),
    outstanding: Number(raw?.outstanding ?? 0),
  };
}

/** The channel badge text: where the money was collected. */
export function channelLabel(channel: PaymentChannel): string {
  return channel === 'ONLINE' ? 'Online' : 'In-person';
}

/** The method label as the studio says it: GCash or cash. */
export function methodLabel(method: PaymentMethod): string {
  return method === 'GCASH' ? 'GCash' : 'Cash';
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return status === 'VERIFIED' ? 'Verified' : status === 'REJECTED' ? 'Rejected' : 'Pending';
}

/** The badge class for a payment state; always paired with its text label. */
export function paymentStatusBadge(status: PaymentStatus): string {
  return status === 'VERIFIED' ? 'success' : status === 'REJECTED' ? 'danger' : 'warning';
}

/** The badge class for a collection channel. */
export function channelBadge(channel: PaymentChannel): string {
  return channel === 'ONLINE' ? 'info' : 'neutral';
}

/**
 * Whether this session may verify or reject a payment.
 *
 * The API refuses STAFF on the same rule and is the authority; this only
 * decides whether the controls are shown or disabled.
 */
export function canReviewPayment(role: string | null, payment: Pick<PaymentRow, 'status'>): boolean {
  return (role === 'ADMIN' || role === 'MANAGER') && payment.status === 'UNVERIFIED';
}

/** Whether this session may record money received at the counter. */
export function canRecordPayment(role: string | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'STAFF';
}

/** Whether this session may edit the GCash payment settings. */
export function canEditPaymentSettings(role: string | null): boolean {
  return role === 'ADMIN';
}

/**
 * The transactions of one appointment, newest first.
 *
 * The detail view shows the whole payment history of the booking, so a
 * part-paid appointment reads as its own story rather than as one row.
 */
export function paymentHistoryFor(payments: PaymentRow[], appointmentId: string): PaymentRow[] {
  return payments
    .filter((payment) => payment.appointmentId === appointmentId)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

/* ==========================================================================
   Recording money received in person

   The server re-checks every figure; these rules exist so a member of staff
   is told about a mistake before the request is sent, not after.
   ========================================================================== */

/** Mirrors the API's 409 so the guard and the server say the same thing. */
export const OVERPAYMENT_MESSAGE = 'The amount exceeds the outstanding balance';

/** The message shown when no amount was entered. */
export const AMOUNT_REQUIRED_MESSAGE = 'Enter the amount received.';

/**
 * The message shown when the amount is not a peso figure.
 *
 * This differs from the shared amount message: the counter form takes the
 * money already in hand, so "800 or 800.50" is the shape it wants.
 */
export const AMOUNT_SHAPE_MESSAGE = 'Enter the amount in pesos, such as 800 or 800.50.';

/**
 * The one client-side money guard.
 *
 * `maxOutstanding` is the server's outstanding figure when it is known; when
 * it is not, no ceiling is applied here and the server's 409 stands alone.
 */
export function recordAmountError(amountText: string, maxOutstanding: number | null): string | null {
  const trimmed = amountText.trim();
  if (!trimmed) return AMOUNT_REQUIRED_MESSAGE;
  if (!isValidAmount(trimmed)) {
    // Zero is a valid amount shape but not a valid payment.
    return isValidAmount(trimmed, { allowZero: true }) ? POSITIVE_AMOUNT_MESSAGE : AMOUNT_SHAPE_MESSAGE;
  }
  const amount = Number(trimmed);
  if (maxOutstanding !== null && amount > maxOutstanding) return OVERPAYMENT_MESSAGE;
  return null;
}

/* ==========================================================================
   Payment settings
   ========================================================================== */

export interface PaymentSettings {
  configured: boolean;
  gcashQrUrl: string | null;
  receiverName: string;
  accountNumberMasked: string;
  downPaymentKind: DownPaymentKind;
  downPaymentValue: number;
}

/** What the settings form starts from when the studio has not configured yet. */
export const DEFAULT_DOWN_PAYMENT_KIND: DownPaymentKind = 'PERCENT';
export const DEFAULT_DOWN_PAYMENT_VALUE = 50;

/** Map one API settings record; unset values fall back to the display default. */
export function toPaymentSettings(raw: any): PaymentSettings {
  const kind = String(raw?.downPaymentKind ?? '').toUpperCase();
  return {
    configured: Boolean(raw?.configured),
    gcashQrUrl: raw?.gcashQrUrl ? String(raw.gcashQrUrl) : null,
    receiverName: String(raw?.receiverName ?? ''),
    accountNumberMasked: String(raw?.accountNumberMasked ?? ''),
    downPaymentKind: kind === 'FIXED' || kind === 'PERCENT' || kind === 'NONE' ? kind : DEFAULT_DOWN_PAYMENT_KIND,
    downPaymentValue: Number(raw?.downPaymentValue ?? DEFAULT_DOWN_PAYMENT_VALUE),
  };
}

export interface PaymentSettingsForm {
  receiverName: string;
  accountNumberMasked: string;
  downPaymentKind: DownPaymentKind;
  /** As typed; parsed only for validation, never used to compute money. */
  downPaymentValue: string;
}

const RECEIVER_NAME_MESSAGE = 'Enter the name the GCash account is under.';
const RECEIVER_NAME_LENGTH_MESSAGE = 'Keep the receiver name under 100 characters.';
const ACCOUNT_MASK_MESSAGE = 'Mask the account number, such as 0917 *** 4567.';
const PERCENT_MESSAGE = 'Enter a down payment percentage above 0 and at most 100.';
const FIXED_MESSAGE = 'Enter the fixed down payment amount in pesos.';

/**
 * Check the payment settings form.
 *
 * The down payment value is only read when a kind needs one: with NONE the
 * field is ignored entirely, so a leftover value cannot block the save.
 */
export function settingsFormErrors(form: PaymentSettingsForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const receiverName = form.receiverName.trim();
  if (!receiverName) errors.receiverName = RECEIVER_NAME_MESSAGE;
  else if (receiverName.length > 100) errors.receiverName = RECEIVER_NAME_LENGTH_MESSAGE;

  const account = form.accountNumberMasked.trim();
  if (account.length > 40 || (account && !/^[\d +*-]+$/.test(account))) errors.accountNumberMasked = ACCOUNT_MASK_MESSAGE;

  if (form.downPaymentKind === 'PERCENT') {
    const value = Number(form.downPaymentValue.trim());
    if (!form.downPaymentValue.trim() || !Number.isFinite(value) || value <= 0 || value > 100) {
      errors.downPaymentValue = PERCENT_MESSAGE;
    }
  } else if (form.downPaymentKind === 'FIXED') {
    if (!isValidAmount(form.downPaymentValue)) errors.downPaymentValue = FIXED_MESSAGE;
  }
  return errors;
}

/** How the down payment rule reads in the settings summary. */
export function describeDownPayment(kind: DownPaymentKind, value: number): string {
  if (kind === 'FIXED') return `₱${value.toLocaleString()} fixed down payment`;
  if (kind === 'PERCENT') return `${value}% down payment`;
  return 'No down payment required';
}

/** A payment proof thumbnail opens with this alternative text. */
export function proofAltText(appointmentCode: string): string {
  return `Payment proof for ${appointmentCode}`;
}
