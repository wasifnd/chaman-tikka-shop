import { z } from 'zod';
import { cartLineSchema, MAX_CART_LINES } from '@/features/checkout/schemas/quote.schema';
import { pakistaniPhone } from '@/lib/validation/phone';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

/**
 * An order taken by staff at the counter: takeaway or dine in, paid in full, in part, or not at
 * all. Whatever isn't paid goes on the customer's khata, so a phone number and a name (checked
 * by the cashier) are then required. Like online orders, nothing here says what anything costs.
 */
export const counterOrderSchema = z
  .object({
    idempotencyKey: z.uuid(),
    lines: z.array(cartLineSchema).min(1, 'Add something to the order').max(MAX_CART_LINES),
    orderType: z.enum(['PICKUP', 'DINE_IN']),
    expectedTotal: z.number().nonnegative().max(10_000_000),
    amountPaid: z.number('Enter the amount paid').nonnegative().max(10_000_000),
    customer: z.object({
      name: optionalText(80),
      // Blank means "no number given" (fine for an order paid in full).
      phone: z.union([z.literal('').transform(() => undefined), pakistaniPhone]).optional(),
    }),
    instructions: optionalText(500),
  })
  .superRefine((value, context) => {
    // The server re-checks against its own total; this catches the obvious case early.
    if (value.amountPaid >= value.expectedTotal) return;
    if (!value.customer.phone) {
      context.addIssue({
        code: 'custom',
        path: ['customer', 'phone'],
        message: 'Enter the phone number for the khata',
      });
    }
    if (!value.customer.name || value.customer.name.length < 2) {
      context.addIssue({
        code: 'custom',
        path: ['customer', 'name'],
        message: 'Enter the name for the khata',
      });
    }
  });

export type CounterOrderRequest = z.output<typeof counterOrderSchema>;
export type CounterOrderInput = z.input<typeof counterOrderSchema>;
