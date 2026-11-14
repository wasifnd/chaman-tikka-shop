import { z } from 'zod';
import { ADJUSTMENT_KINDS } from '../logic/khata-rules';

const MAX = 10_000_000;

const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

const amount = z
  .number('Enter an amount')
  .positive('Enter an amount above zero')
  .max(MAX, 'That amount is too large')
  .refine(twoDecimals, 'Use at most 2 decimals');

const optionalNote = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((value) => (value ? value : undefined));

/** Staff or admin record money the customer paid towards their khata. */
export const paymentSchema = z.object({
  amount,
  note: optionalNote,
  /** A new key per payment; sending the same one again is answered with the first result. */
  requestKey: z.uuid(),
});
export type PaymentInput = z.input<typeof paymentSchema>;

/** Admin corrections. Every one needs a reason; a write-off clears the whole balance. */
export const adjustmentSchema = z
  .object({
    kind: z.enum(ADJUSTMENT_KINDS),
    amount: amount.optional(),
    reason: z.string().trim().min(3, 'Give a reason for the correction').max(300),
    requestKey: z.uuid(),
    /** For a write-off: the balance the admin saw, so it never clears more than they meant. */
    expectedBalance: z.number().nonnegative().max(MAX).optional(),
  })
  .superRefine((value, context) => {
    if (value.kind !== 'WRITE_OFF' && value.amount === undefined) {
      context.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount' });
    }
    if (value.kind === 'WRITE_OFF' && value.expectedBalance === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['expectedBalance'],
        message: 'Say which balance is being written off',
      });
    }
  });
export type AdjustmentInput = z.input<typeof adjustmentSchema>;

/** Admin sets a customer's own limit, or null to use the shop's default. */
export const limitSchema = z.object({
  creditLimit: z
    .number('Enter a limit')
    .min(0, 'Cannot be negative')
    .max(MAX, 'That limit is too large')
    .refine(twoDecimals, 'Use at most 2 decimals')
    .nullable(),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  all: z.enum(['1']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});
