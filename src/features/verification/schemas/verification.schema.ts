import { z } from 'zod';
import { pakistaniPhone } from '@/lib/validation/phone';

export const startVerificationSchema = z.object({ phone: pakistaniPhone });

/** Signup and checkout send the id of the request that proved the number. */
export const verificationIdField = z.uuid().optional();
