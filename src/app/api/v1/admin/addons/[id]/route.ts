import { addonInputSchema } from '@/features/admin/schemas/catalog.schema';
import { parseId, requireAdmin, type IdContext } from '@/features/admin/http';
import { products, revalidateMenu } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const PATCH = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'ADDON_NOT_FOUND', 'That add-on does not exist.');
  await products.updateAddon(id, await parseBody(request, addonInputSchema));
  revalidateMenu();
  return ok({});
});

export const DELETE = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'ADDON_NOT_FOUND', 'That add-on does not exist.');
  await products.removeAddon(id);
  revalidateMenu();
  return ok({ outcome: 'deleted' });
});
