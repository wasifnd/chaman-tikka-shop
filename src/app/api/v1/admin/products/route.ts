import { z } from 'zod';
import { requireAdmin } from '@/features/admin/http';
import { productInputSchema } from '@/features/admin/schemas/catalog.schema';
import { products, revalidateMenu } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

const filterSchema = z.object({
  q: z.string().trim().max(80).optional(),
  categoryId: z.uuid().optional(),
});

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  const params = new URL(request.url).searchParams;
  const filter = filterSchema.parse({
    q: params.get('q') ?? undefined,
    categoryId: params.get('categoryId') ?? undefined,
  });
  return ok({ products: await products.list(filter) });
});

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const id = await products.create(await parseBody(request, productInputSchema));
  revalidateMenu();
  return ok({ id }, { status: 201 });
});
