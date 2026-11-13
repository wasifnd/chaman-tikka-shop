import type { PrismaClient } from '@prisma/client';
import { phoneNotVerified } from '@/features/verification/services/verification.service';

export interface OrderPhoneDeps {
  /** When a WhatsApp check proved this number (see features/verification), or null. */
  provenAt(verificationId: string | undefined, phone: string): Promise<Date | null>;
  /** The signed-in customer's own number and when it was proven. */
  accountPhone(customerId: string): Promise<{ phone: string | null; verifiedAt: Date | null }>;
  /** The customer account that signs in with this number, if there is one. */
  customerFor(phone: string): Promise<string | null>;
}

export interface OrderOwner {
  customerId: string | null;
  phoneVerifiedAt: Date;
}

/**
 * Every order's contact number must be proven, either by the signed-in account's own proven
 * number or by a WhatsApp check. A proven number then decides whose order it is: the signed-in
 * customer's, or else the account that signs in with that number, so guest orders show up in the
 * right account's history.
 */
export async function resolveOrderOwner(
  input: { phone: string; verificationId?: string | undefined; customerId: string | null },
  deps: OrderPhoneDeps,
): Promise<OrderOwner> {
  let provenAt = await deps.provenAt(input.verificationId, input.phone);
  if (!provenAt && input.customerId) {
    const own = await deps.accountPhone(input.customerId);
    if (own.phone === input.phone && own.verifiedAt) provenAt = own.verifiedAt;
  }
  if (!provenAt) throw phoneNotVerified('contact.phone');
  return {
    customerId: input.customerId ?? (await deps.customerFor(input.phone)),
    phoneVerifiedAt: provenAt,
  };
}

export function createOrderPhoneRepository(prisma: PrismaClient): Omit<OrderPhoneDeps, 'provenAt'> {
  return {
    async accountPhone(customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { user: { select: { phone: true, phoneVerifiedAt: true } } },
      });
      return {
        phone: customer?.user.phone ?? null,
        verifiedAt: customer?.user.phoneVerifiedAt ?? null,
      };
    },

    async customerFor(phone) {
      const user = await prisma.user.findUnique({
        where: { phone },
        select: { role: true, customer: { select: { id: true } } },
      });
      return user?.role === 'CUSTOMER' ? (user.customer?.id ?? null) : null;
    },
  };
}
