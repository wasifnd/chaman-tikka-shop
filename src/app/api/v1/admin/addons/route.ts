import { addonInputSchema } from '@/features/admin/schemas/catalog.schema';
import { requireAdmin } from '@/features/admin/http';
import { products, revalidateMenu } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return ok({ addons: await products.listAddons() });
});

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const input = await parseBody(request, addonInputSchema);
  const id = await products.createAddon(input);
  revalidateMenu();
  return ok({ id }, { status: 201 });
});
