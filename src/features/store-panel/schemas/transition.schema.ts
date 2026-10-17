import { z } from 'zod';
import { ORDER_STATUSES } from '@/features/orders/state-machine';

export const MAX_REASON_LENGTH = 200;

export const transitionRequestSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z
    .string()
    .trim()
    .max(MAX_REASON_LENGTH)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type TransitionRequest = z.output<typeof transitionRequestSchema>;
