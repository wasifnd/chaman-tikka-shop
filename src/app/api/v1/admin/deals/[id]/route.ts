import { dealInputSchema } from '@/features/admin/schemas/catalog.schema';
import { parseId, requireAdmin, type IdContext } from '@/features/admin/http';
import { deals, revalidateMenu } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const PATCH = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'DEAL_NOT_FOUND', 'That deal does not exist.');
  await deals.update(id, await parseBody(request, dealInputSchema));
  revalidateMenu();
  return ok({});
});

export const DELETE = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'DEAL_NOT_FOUND', 'That deal does not exist.');
  const outcome = await deals.remove(id);
  revalidateMenu();
  return ok({ outcome });
});
