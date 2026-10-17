import { dealInputSchema } from '@/features/admin/schemas/catalog.schema';
import { requireAdmin } from '@/features/admin/http';
import { deals, revalidateMenu } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return ok({ deals: await deals.list() });
});

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const input = await parseBody(request, dealInputSchema);
  const id = await deals.create(input);
  revalidateMenu();
  return ok({ id }, { status: 201 });
});
