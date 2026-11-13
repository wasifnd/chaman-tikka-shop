import { randomInt } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { extractCode } from '../logic/whatsapp';

export interface VerificationRecord {
  id: string;
  phone: string;
  code: string;
  expiresAt: Date;
  verifiedAt: Date | null;
}

/** Persistence port. The Prisma implementation lives in verification.repository.ts. */
export interface VerificationRepository {
  create(input: { phone: string; code: string; expiresAt: Date }): Promise<VerificationRecord>;
  findById(id: string): Promise<VerificationRecord | null>;
  /** Marks this phone's open request with this code as proven. False if there is none. */
  markVerified(phone: string, code: string, at: Date): Promise<boolean>;
  /** Marks one open request as proven (the development stand-in). False if it isn't open. */
  markVerifiedById(id: string, at: Date): Promise<boolean>;
}

/** How long the customer has to send the code. */
export const CODE_TTL_MS = 10 * 60_000;
/** How long a proven number can be used to sign up or order before proving it again. */
export const PROOF_TTL_MS = 30 * 60_000;

export type VerificationStatus = 'pending' | 'verified' | 'expired';

export const phoneNotVerified = (field: string) =>
  new AppError('PHONE_NOT_VERIFIED', 'Please verify your phone number on WhatsApp first.', 403, {
    [field]: 'Verify this number on WhatsApp first',
  });

export function createVerificationService(
  repo: VerificationRepository,
  now: () => Date = () => new Date(),
  newCode: () => string = () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
) {
  const proofStillValid = (record: VerificationRecord): boolean =>
    record.verifiedAt !== null && now().getTime() - record.verifiedAt.getTime() <= PROOF_TTL_MS;

  return {
    /** Opens a request for this (already normalised) phone and returns the code to send. */
    async start(phone: string): Promise<VerificationRecord> {
      return repo.create({
        phone,
        code: newCode(),
        expiresAt: new Date(now().getTime() + CODE_TTL_MS),
      });
    },

    /** A WhatsApp message arrived from `phone`: proves the request whose code it carries. */
    async confirm(phone: string, text: string): Promise<boolean> {
      const code = extractCode(text);
      return code ? repo.markVerified(phone, code, now()) : false;
    },

    /** Development only (the caller checks the mode): stands in for sending the message. */
    confirmById(id: string): Promise<boolean> {
      return repo.markVerifiedById(id, now());
    },

    async status(id: string): Promise<VerificationStatus | null> {
      const record = await repo.findById(id);
      if (!record) return null;
      if (record.verifiedAt) return proofStillValid(record) ? 'verified' : 'expired';
      return record.expiresAt > now() ? 'pending' : 'expired';
    },

    /**
     * When `phone` was proven by request `id`, or null if it wasn't, was proven for another number,
     * or the proof is too old. Never trusts the browser's word for the number.
     */
    async provenAt(id: string | undefined, phone: string): Promise<Date | null> {
      if (!id) return null;
      const record = await repo.findById(id);
      if (!record || record.phone !== phone || !proofStillValid(record)) return null;
      return record.verifiedAt;
    },
  };
}

export type VerificationService = ReturnType<typeof createVerificationService>;
