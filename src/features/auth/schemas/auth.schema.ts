import { z } from 'zod';
import { verificationIdField } from '@/features/verification/schemas/verification.schema';
import { pakistaniPhone } from '@/lib/validation/phone';

// Trim and lowercase *before* validating, otherwise ' A@b.pk' fails the email check.
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email'));

/** An untouched optional field submits "", which must mean "not provided", not "invalid". */
export const optionalEmail = z.union([z.literal('').transform(() => undefined), email]).optional();

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  // The phone number is the account: it's how you sign in and how your orders find you.
  phone: pakistaniPhone,
  email: optionalEmail,
  // bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password is too long'),
  /** The WhatsApp check that proved the phone number (see features/verification). */
  verificationId: verificationIdField,
});

export const loginSchema = z.object({
  phone: pakistaniPhone,
  password: z.string().min(1, 'Enter your password'),
});

export type SignupInput = z.output<typeof signupSchema>;
export type LoginInput = z.output<typeof loginSchema>;
// What the form holds before transforms (trim, lowercase) are applied.
export type SignupFormValues = z.input<typeof signupSchema>;
export type LoginFormValues = z.input<typeof loginSchema>;
