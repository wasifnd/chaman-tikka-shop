import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/http/guards';

export interface CustomerContext {
  userId: string;
  customerId: string;
}

/**
 * Every account endpoint: same-site only (for changes), signed in, and with a customer profile.
 * Staff and admin accounts have none, so they get a clear 403 instead of an empty account.
 */
export async function requireCustomer(request: Request): Promise<CustomerContext> {
  if (request.method !== 'GET') assertSameOrigin(request);
  const session = await requireSession();
  if (!session.customerId) {
    throw new AppError('NO_CUSTOMER_PROFILE', 'This account has no customer profile.', 403);
  }
  return { userId: session.userId, customerId: session.customerId };
}

/** A malformed id is simply "not found". */
export function parseAddressId(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new AppError('ADDRESS_NOT_FOUND', 'That address does not exist.', 404);
  return parsed.data;
}
