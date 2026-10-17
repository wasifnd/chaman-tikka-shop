import { z } from 'zod';
import { pakistaniPhone } from '@/lib/validation/phone';

// Trim and lowercase *before* validating, otherwise ' A@b.pk' fails the email check.
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email,
  // bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password is too long'),
  // An untouched form field submits "", which must mean "not provided", not "invalid".
  phone: z.union([z.literal('').transform(() => undefined), pakistaniPhone]).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export type SignupInput = z.output<typeof signupSchema>;
export type LoginInput = z.output<typeof loginSchema>;
// What the form holds before transforms (trim, lowercase) are applied.
export type SignupFormValues = z.input<typeof signupSchema>;
export type LoginFormValues = z.input<typeof loginSchema>;
