import { requireAdmin } from '@/features/admin/http';
import { ordersQuerySchema } from '@/features/admin/schemas/operations.schema';
import { adminOrders } from '@/features/admin/server';
import { ok, route } from '@/lib/http/response';

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  const query = ordersQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(await adminOrders.search(query));
});
