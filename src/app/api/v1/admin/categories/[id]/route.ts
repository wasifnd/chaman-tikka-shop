import { categoryInputSchema } from '@/features/admin/schemas/catalog.schema';
import { parseId, requireAdmin, type IdContext } from '@/features/admin/http';
import { categories, revalidateMenu } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const PATCH = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'CATEGORY_NOT_FOUND', 'That category does not exist.');
  await categories.update(id, await parseBody(request, categoryInputSchema));
  revalidateMenu();
  return ok({});
});

export const DELETE = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'CATEGORY_NOT_FOUND', 'That category does not exist.');
  await categories.remove(id);
  revalidateMenu();
  return ok({ outcome: 'deleted' });
});
