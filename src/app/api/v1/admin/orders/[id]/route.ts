import { parseId, requireAdmin, type IdContext } from '@/features/admin/http';
import { adminOrders } from '@/features/admin/server';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http/response';

export const GET = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'ORDER_NOT_FOUND', 'That order does not exist.');
  const order = await adminOrders.get(id);
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'That order does not exist.', 404);
  return ok({ order });
});
