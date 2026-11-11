import { z } from 'zod';

export const MAX_ADDRESSES = 10;

export const addressInputSchema = z.object({
  label: z.string().trim().min(1, 'Give it a name, like Home').max(30, 'Use at most 30 characters'),
  addressLine1: z
    .string()
    .trim()
    .min(3, 'Enter your street address')
    .max(200, 'Use at most 200 characters'),
  // An untouched optional field arrives as "", which means "none".
  addressLine2: z
    .string()
    .trim()
    .max(200, 'Use at most 200 characters')
    .nullish()
    .transform((value) => (value ? value : null)),
  zoneId: z.uuid('Choose your area'),
  isDefault: z.boolean(),
});

export type AddressInput = z.output<typeof addressInputSchema>;
export type AddressFormValues = z.input<typeof addressInputSchema>;
