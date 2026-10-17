import { couponInputSchema } from '@/features/admin/schemas/operations.schema';
import { requireAdmin } from '@/features/admin/http';
import { operations } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return ok({ coupons: await operations.listCoupons() });
});

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const input = await parseBody(request, couponInputSchema);
  const id = await operations.createCoupon(input);
  return ok({ id }, { status: 201 });
});
