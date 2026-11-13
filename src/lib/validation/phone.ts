import { z } from 'zod';

/**
 * Turns any way of writing a Pakistani mobile number into the one stored form, 03XXXXXXXXX, or
 * returns null when it isn't one. "+92 300-1234567", "923001234567" (how WhatsApp writes it) and
 * "0300 1234567" all become "03001234567", so one person always has one number.
 */
export function normalizePhone(value: string): string | null {
  const compact = value.trim().replace(/[\s\-().]/g, '');
  const local = /^(?:\+?92|0)(3\d{9})$/.exec(compact)?.[1];
  return local ? `0${local}` : null;
}

/** Pakistani mobile numbers, stored as 03XXXXXXXXX whichever way they were typed. */
export const pakistaniPhone = z.string().transform((value, context) => {
  const phone = normalizePhone(value);
  if (phone) return phone;
  context.addIssue({ code: 'custom', message: 'Enter a valid mobile number, e.g. 03001234567' });
  return z.NEVER;
});

/** The international form WhatsApp links need: "03001234567" becomes "923001234567". */
export const toInternational = (phone: string): string => `92${phone.slice(1)}`;
