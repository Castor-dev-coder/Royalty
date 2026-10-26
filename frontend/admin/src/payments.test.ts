import { describe, expect, it } from 'vitest';
import {
  AMOUNT_REQUIRED_MESSAGE,
  OVERPAYMENT_MESSAGE,
  POSITIVE_AMOUNT_MESSAGE,
  canEditPaymentSettings,
  canRecordPayment,
  canReviewPayment,
  channelLabel,
  describeDownPayment,
  methodLabel,
  paymentHistoryFor,
  proofAltText,
  recordAmountError,
  settingsFormErrors,
  toPaymentRow,
  toPaymentSettings,
  type PaymentRow,
  type PaymentSettingsForm,
} from './payments';

const API_PAYMENT = {
  id: 'pay-1',
  appointmentId: 'apt-1',
  appointmentCode: 'APT-0001',
  customerName: 'Maria Santos',
  customerEmail: 'maria@example.com',
  serviceName: 'Hair Color',
  amount: 500,
  paymentMethod: 'GCASH',
  channel: 'ONLINE',
  status: 'UNVERIFIED',
  referenceNo: 'GC-123',
  proofUrl: 'https://cdn.example.com/proof.png',
  bookingStatus: 'CONFIRMED',
  recordedBy: 'Counter One',
  verifiedBy: null,
  verifiedAt: null,
  createdAt: '2026-10-25T10:00:00.000Z',
  appointmentTotal: 1500,
  verifiedTotal: 1000,
  outstanding: 500,
};

function row(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return { ...toPaymentRow(API_PAYMENT), ...overrides };
}

describe('toPaymentRow', () => {
  it('keeps the server figures exactly as they arrived', () => {
    const mapped = toPaymentRow(API_PAYMENT);
    expect(mapped.amount).toBe(500);
    expect(mapped.appointmentTotal).toBe(1500);
    expect(mapped.verifiedTotal).toBe(1000);
    expect(mapped.outstanding).toBe(500);
    expect(mapped.appointmentCode).toBe('APT-0001');
    expect(mapped.referenceNo).toBe('GC-123');
    expect(mapped.proofUrl).toBe('https://cdn.example.com/proof.png');
  });

  it('normalizes method, channel and status case-insensitively', () => {
    const mapped = toPaymentRow({ ...API_PAYMENT, paymentMethod: 'cash', channel: 'in_person', status: 'verified' });
    expect(mapped.paymentMethod).toBe('CASH');
    expect(mapped.channel).toBe('IN_PERSON');
    expect(mapped.status).toBe('VERIFIED');
  });

  it('falls back to an in-person cash row when the fields are missing', () => {
    const mapped = toPaymentRow({ id: 'pay-2', appointmentId: 'apt-2' });
    expect(mapped.paymentMethod).toBe('CASH');
    expect(mapped.channel).toBe('IN_PERSON');
    expect(mapped.status).toBe('UNVERIFIED');
    expect(mapped.proofUrl).toBeNull();
    expect(mapped.referenceNo).toBeNull();
    expect(mapped.amount).toBe(0);
  });
});

describe('labels', () => {
  it('names the channel and the method as the studio says them', () => {
    expect(channelLabel('ONLINE')).toBe('Online');
    expect(channelLabel('IN_PERSON')).toBe('In-person');
    expect(methodLabel('GCASH')).toBe('GCash');
    expect(methodLabel('CASH')).toBe('Cash');
    expect(proofAltText('APT-0001')).toBe('Payment proof for APT-0001');
  });
});

describe('review and record permissions', () => {
  it('lets administrators and managers review an unverified payment only', () => {
    expect(canReviewPayment('ADMIN', { status: 'UNVERIFIED' })).toBe(true);
    expect(canReviewPayment('MANAGER', { status: 'UNVERIFIED' })).toBe(true);
    expect(canReviewPayment('STAFF', { status: 'UNVERIFIED' })).toBe(false);
    expect(canReviewPayment('ADMIN', { status: 'VERIFIED' })).toBe(false);
    expect(canReviewPayment('ADMIN', { status: 'REJECTED' })).toBe(false);
  });

  it('lets every staff role record money received, but only admins edit settings', () => {
    expect(canRecordPayment('STAFF')).toBe(true);
    expect(canRecordPayment('MANAGER')).toBe(true);
    expect(canRecordPayment('ADMIN')).toBe(true);
    expect(canRecordPayment('CUSTOMER')).toBe(false);
    expect(canEditPaymentSettings('ADMIN')).toBe(true);
    expect(canEditPaymentSettings('MANAGER')).toBe(false);
  });
});

describe('paymentHistoryFor', () => {
  it('keeps only the transactions of the one appointment, newest first', () => {
    const older = row({ id: 'pay-1', createdAt: '2026-10-25T10:00:00.000Z' });
    const newer = row({ id: 'pay-2', createdAt: '2026-10-26T09:00:00.000Z' });
    const other = row({ id: 'pay-3', appointmentId: 'apt-2' });
    expect(paymentHistoryFor([older, other, newer], 'apt-1').map((payment) => payment.id)).toEqual(['pay-2', 'pay-1']);
  });
});

describe('recordAmountError (overpayment guard)', () => {
  it('refuses an amount above the outstanding balance with the server message', () => {
    expect(recordAmountError('600', 500)).toBe(OVERPAYMENT_MESSAGE);
    expect(recordAmountError('1500.50', 1500.5)).toBeNull();
    expect(recordAmountError('500', 500)).toBeNull();
  });

  it('asks for an amount when the field is empty', () => {
    expect(recordAmountError('', 500)).toBe(AMOUNT_REQUIRED_MESSAGE);
  });

  it('refuses zero and non-amounts', () => {
    expect(recordAmountError('0', 500)).toBe(POSITIVE_AMOUNT_MESSAGE);
    expect(recordAmountError('pesos', 500)).toBe('Enter the amount in pesos, such as 800 or 800.50.');
    expect(recordAmountError('100.999', 500)).toBe('Enter the amount in pesos, such as 800 or 800.50.');
  });

  it('applies no ceiling when the outstanding figure is unknown', () => {
    expect(recordAmountError('9999', null)).toBeNull();
  });
});

describe('settingsFormErrors', () => {
  const form: PaymentSettingsForm = {
    receiverName: 'Maria Santos',
    accountNumberMasked: '0917 *** 4567',
    downPaymentKind: 'PERCENT',
    downPaymentValue: '50',
  };

  it('accepts the default 50 percent down payment', () => {
    expect(settingsFormErrors(form)).toEqual({});
  });

  it('requires a receiver name and keeps it short', () => {
    expect(settingsFormErrors({ ...form, receiverName: '  ' }).receiverName).toBeTruthy();
    expect(settingsFormErrors({ ...form, receiverName: 'x'.repeat(101) }).receiverName).toBeTruthy();
    expect(settingsFormErrors({ ...form, receiverName: 'x'.repeat(100) })).toEqual({});
  });

  it('only accepts a masked account number', () => {
    expect(settingsFormErrors({ ...form, accountNumberMasked: 'not a number' }).accountNumberMasked).toBeTruthy();
    expect(settingsFormErrors({ ...form, accountNumberMasked: '' })).toEqual({});
  });

  it('bounds the percentage and demands a peso figure for a fixed down payment', () => {
    expect(settingsFormErrors({ ...form, downPaymentValue: '101' }).downPaymentValue).toBeTruthy();
    expect(settingsFormErrors({ ...form, downPaymentValue: '0' }).downPaymentValue).toBeTruthy();
    expect(settingsFormErrors({ ...form, downPaymentValue: '' }).downPaymentValue).toBeTruthy();
    expect(settingsFormErrors({ ...form, downPaymentKind: 'FIXED', downPaymentValue: '500' })).toEqual({});
    expect(settingsFormErrors({ ...form, downPaymentKind: 'FIXED', downPaymentValue: 'free' }).downPaymentValue).toBeTruthy();
  });

  it('ignores the value entirely when no down payment is required', () => {
    expect(settingsFormErrors({ ...form, downPaymentKind: 'NONE', downPaymentValue: 'nonsense' })).toEqual({});
  });
});

describe('settings display defaults', () => {
  it('shows a 50 percent down payment when nothing is configured', () => {
    const settings = toPaymentSettings({ configured: false });
    expect(settings.configured).toBe(false);
    expect(settings.downPaymentKind).toBe('PERCENT');
    expect(settings.downPaymentValue).toBe(50);
    expect(settings.gcashQrUrl).toBeNull();
    expect(describeDownPayment(settings.downPaymentKind, settings.downPaymentValue)).toBe('50% down payment');
  });

  it('reads the server values when they are set', () => {
    const settings = toPaymentSettings({
      configured: true,
      gcashQrUrl: 'https://cdn.example.com/qr.png',
      receiverName: 'Maria Santos',
      accountNumberMasked: '0917 *** 4567',
      downPaymentKind: 'FIXED',
      downPaymentValue: 500,
    });
    expect(settings.downPaymentKind).toBe('FIXED');
    expect(describeDownPayment(settings.downPaymentKind, settings.downPaymentValue)).toBe('₱500 fixed down payment');
    expect(describeDownPayment('NONE', 0)).toBe('No down payment required');
  });
});
