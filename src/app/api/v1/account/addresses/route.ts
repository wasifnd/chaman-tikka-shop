import { requireCustomer } from '@/features/account/http';
import { addressInputSchema } from '@/features/account/schemas/address.schema';
import { account } from '@/features/account/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const GET = route(async (request: Request) => {
  const { customerId } = await requireCustomer(request);
  return ok(
    { addresses: await account.listAddresses(customerId) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});

export const POST = route(async (request: Request) => {
  const { customerId } = await requireCustomer(request);
  const id = await account.createAddress(customerId, await parseBody(request, addressInputSchema));
  return ok({ id }, { status: 201 });
});
