import { z } from 'zod';

export const paymentStatusUpdateSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
});

export const inPersonPaymentSchema = z.object({
  appointmentId: z.string().uuid(),
  method: z.enum(['CASH', 'GCASH']),
  amount: z.number().positive(),
  referenceNo: z.string().trim().min(1).max(100).optional(),
});

export const onlinePaymentSchema = z.object({
  option: z.enum(['FULL', 'DOWN']),
  referenceNo: z.string().trim().min(3).max(100),
});

export const paymentSettingsSchema = z.object({
  receiverName: z.string().trim().min(1).max(100).nullish(),
  accountNumberMasked: z.string().trim().min(1).max(30).nullish(),
  downPaymentKind: z.enum(['NONE', 'FIXED', 'PERCENT']).optional(),
  downPaymentValue: z.number().min(0).max(100000).optional(),
});

export type PaymentStatusUpdateInput = z.infer<typeof paymentStatusUpdateSchema>;
export type InPersonPaymentInput = z.infer<typeof inPersonPaymentSchema>;
export type OnlinePaymentInput = z.infer<typeof onlinePaymentSchema>;
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;
