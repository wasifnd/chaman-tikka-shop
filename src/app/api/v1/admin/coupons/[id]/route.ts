import { couponInputSchema } from '@/features/admin/schemas/operations.schema';
import { parseId, requireAdmin, type IdContext } from '@/features/admin/http';
import { operations } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const PATCH = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'COUPON_NOT_FOUND', 'That coupon does not exist.');
  await operations.updateCoupon(id, await parseBody(request, couponInputSchema));
  return ok({});
});

export const DELETE = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'COUPON_NOT_FOUND', 'That coupon does not exist.');
  const outcome = await operations.removeCoupon(id);
  return ok({ outcome });
});
