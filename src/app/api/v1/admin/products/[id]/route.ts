import { parseId, requireAdmin, type IdContext } from '@/features/admin/http';
import { productInputSchema } from '@/features/admin/schemas/catalog.schema';
import { products, revalidateMenu } from '@/features/admin/server';
import { AppError } from '@/lib/errors';
import { ok, parseBody, route } from '@/lib/http/response';

const NOT_FOUND = ['PRODUCT_NOT_FOUND', 'That product does not exist.'] as const;

export const GET = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, ...NOT_FOUND);
  const product = await products.get(id);
  if (!product) throw new AppError(...NOT_FOUND, 404);
  return ok({ product });
});

export const PATCH = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, ...NOT_FOUND);
  await products.update(id, await parseBody(request, productInputSchema));
  revalidateMenu();
  return ok({});
});

export const DELETE = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, ...NOT_FOUND);
  const outcome = await products.remove(id);
  revalidateMenu();
  return ok({ outcome });
});
