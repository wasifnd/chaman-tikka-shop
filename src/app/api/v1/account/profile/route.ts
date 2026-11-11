import { requireCustomer } from '@/features/account/http';
import { account } from '@/features/account/server';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http/response';

/** What checkout needs to fill itself in: the customer's details and their saved addresses. */
export const GET = route(async (request: Request) => {
  const { customerId } = await requireCustomer(request);
  const [profile, addresses] = await Promise.all([
    account.getProfile(customerId),
    account.listAddresses(customerId),
  ]);
  if (!profile)
    throw new AppError('NO_CUSTOMER_PROFILE', 'This account has no customer profile.', 403);
  return ok({ profile, addresses }, { headers: { 'Cache-Control': 'no-store' } });
});
