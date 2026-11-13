import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizePhone } from '@/lib/validation/phone';

/**
 * Phone numbers are proven the free way round: the customer sends a code to our WhatsApp number
 * from their own phone. Messages people send to a business cost nothing on the WhatsApp Business
 * Platform, and WhatsApp tells us which number each message came from, so nobody can prove a
 * number they don't hold. (Sending codes *to* people is billed per message, by SMS or WhatsApp.)
 */
export type VerificationConfig =
  | {
      mode: 'whatsapp';
      /** Our WhatsApp number in international form without "+", e.g. 923001234567. */
      businessNumber: string;
      appSecret: string;
      verifyToken: string;
      /** Optional: thank the customer on WhatsApp (free within Meta's monthly service allowance). */
      reply: { accessToken: string; phoneNumberId: string } | null;
    }
  /** Local development: the page offers a button that stands in for sending the message. */
  | { mode: 'dev' }
  /** A live site without WhatsApp set up: phone checks are refused with a clear message. */
  | { mode: 'off' };

export function verificationConfig(source: Record<string, string | undefined>): VerificationConfig {
  const businessNumber = source['WHATSAPP_BUSINESS_NUMBER']?.replace(/\D/g, '');
  const appSecret = source['WHATSAPP_APP_SECRET'];
  const verifyToken = source['WHATSAPP_VERIFY_TOKEN'];
  if (businessNumber && appSecret && verifyToken) {
    const accessToken = source['WHATSAPP_ACCESS_TOKEN'];
    const phoneNumberId = source['WHATSAPP_PHONE_NUMBER_ID'];
    return {
      mode: 'whatsapp',
      businessNumber,
      appSecret,
      verifyToken,
      reply: accessToken && phoneNumberId ? { accessToken, phoneNumberId } : null,
    };
  }
  // Never on a live site: there the stand-in button would let anyone claim any number.
  return source['NODE_ENV'] === 'production' ? { mode: 'off' } : { mode: 'dev' };
}

/** The text the customer sends; the code is what proves this message belongs to their request. */
export const verificationMessage = (code: string) => `BBQ Store code: ${code}`;

/** A link that opens WhatsApp with the message ready to send to our number. */
export const whatsappLink = (businessNumber: string, code: string) =>
  `https://wa.me/${businessNumber}?text=${encodeURIComponent(verificationMessage(code))}`;

/** The 6-digit code in a message, however the customer edited the text around it. */
export function extractCode(text: string): string | null {
  return /(?<!\d)(\d{6})(?!\d)/.exec(text)?.[1] ?? null;
}

/** Meta signs each webhook call with the app secret; anything unsigned or altered is rejected. */
export function isSignedByMeta(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface IncomingText {
  /** The sender's number in our stored form (03XXXXXXXXX). */
  phone: string;
  text: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Text messages from Pakistani numbers in a webhook call; everything else is ignored. */
export function incomingTexts(payload: unknown): IncomingText[] {
  if (!isRecord(payload)) return [];
  const found: IncomingText[] = [];
  for (const entry of list(payload['entry'])) {
    if (!isRecord(entry)) continue;
    for (const change of list(entry['changes'])) {
      if (!isRecord(change) || !isRecord(change['value'])) continue;
      for (const message of list(change['value']['messages'])) {
        if (!isRecord(message) || message['type'] !== 'text') continue;
        const from = message['from'];
        const body = isRecord(message['text']) ? message['text']['body'] : undefined;
        if (typeof from !== 'string' || typeof body !== 'string') continue;
        const phone = normalizePhone(from);
        if (phone) found.push({ phone, text: body });
      }
    }
  }
  return found;
}
