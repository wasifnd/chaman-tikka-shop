import { z } from 'zod';
import { pakistaniPhone } from '@/lib/validation/phone';
import type { OrderType } from '../state-machine';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

/**
 * The fields on the checkout form. Mirrors the server's rules so mistakes are caught before a
 * request is sent; the server checks everything again regardless. The street address is only
 * required for delivery.
 */
export function checkoutFormSchema(orderType: OrderType) {
  return z.object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    phone: pakistaniPhone,
    email: z
      .union([
        z.literal('').transform(() => undefined),
        z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email')),
      ])
      .optional(),
    addressLine1:
      orderType === 'DELIVERY'
        ? z.string().trim().min(3, 'Enter your street address').max(200)
        : optionalText(200),
    addressLine2: optionalText(200),
    instructions: optionalText(500),
  });
}

export type CheckoutFormValues = z.input<ReturnType<typeof checkoutFormSchema>>;
export type CheckoutFormOutput = z.output<ReturnType<typeof checkoutFormSchema>>;
