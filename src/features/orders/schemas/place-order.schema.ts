import { z } from 'zod';
import { quoteRequestSchema } from '@/features/checkout/schemas/quote.schema';
import { pakistaniPhone } from '@/lib/validation/phone';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email'));

/**
 * What the browser sends to place an order. It says what is in the cart and who to contact; it
 * never says what anything costs. `expectedTotal` is only a safety check: if the server's own
 * total differs, the order is refused so the customer is never charged more than they saw.
 */
export const placeOrderSchema = quoteRequestSchema
  .extend({
    idempotencyKey: z.uuid(),
    expectedTotal: z.number().nonnegative().max(10_000_000),
    contact: z.object({
      name: z.string().trim().min(2, 'Enter your name').max(80),
      phone: pakistaniPhone,
      // An untouched optional field arrives as "", which means "not provided".
      email: z.union([z.literal('').transform(() => undefined), email]).optional(),
    }),
    address: z
      .object({
        line1: z.string().trim().min(3, 'Enter your street address').max(200),
        line2: z
          .string()
          .trim()
          .max(200)
          .optional()
          .transform((value) => (value ? value : undefined)),
      })
      .optional(),
    instructions: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .superRefine((value, context) => {
    if (value.orderType === 'DELIVERY' && !value.address) {
      context.addIssue({
        code: 'custom',
        path: ['address', 'line1'],
        message: 'Enter your delivery address',
      });
    }
  });

export type PlaceOrderRequest = z.output<typeof placeOrderSchema>;
