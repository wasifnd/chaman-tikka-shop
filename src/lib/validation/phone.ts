import { z } from 'zod';

/**
 * Pakistani mobile numbers: 03XXXXXXXXX or +923XXXXXXXXX. Spaces and dashes are allowed on input
 * and removed, so every stored number looks the same.
 */
export const pakistaniPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(\+92|0)3\d{9}$/, 'Enter a valid mobile number, e.g. 03001234567'));
