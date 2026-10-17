import { z } from 'zod';
import { parseId, requireAdmin, type IdContext } from '@/features/admin/http';
import { products, revalidateMenu } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

const bodySchema = z.object({ isAvailable: z.boolean() });

/** The "sold out" switch: the quickest thing the kitchen asks the owner to change mid-service. */
export const PUT = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'PRODUCT_NOT_FOUND', 'That product does not exist.');
  const { isAvailable } = await parseBody(request, bodySchema);
  await products.setAvailability(id, isAvailable);
  revalidateMenu();
  return ok({});
});
