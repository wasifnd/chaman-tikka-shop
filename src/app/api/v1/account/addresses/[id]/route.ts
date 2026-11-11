import { parseAddressId, requireCustomer } from '@/features/account/http';
import { addressInputSchema } from '@/features/account/schemas/address.schema';
import { account } from '@/features/account/server';
import { ok, parseBody, route } from '@/lib/http/response';

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Context) => {
  const { customerId } = await requireCustomer(request);
  const id = parseAddressId((await params).id);
  await account.updateAddress(customerId, id, await parseBody(request, addressInputSchema));
  return ok({});
});

export const DELETE = route(async (request: Request, { params }: Context) => {
  const { customerId } = await requireCustomer(request);
  await account.deleteAddress(customerId, parseAddressId((await params).id));
  return ok({});
});
