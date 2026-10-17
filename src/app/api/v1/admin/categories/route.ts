import { categoryInputSchema } from '@/features/admin/schemas/catalog.schema';
import { requireAdmin } from '@/features/admin/http';
import { categories, revalidateMenu } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return ok({ categories: await categories.list() });
});

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const input = await parseBody(request, categoryInputSchema);
  const id = await categories.create(input);
  revalidateMenu();
  return ok({ id }, { status: 201 });
});
