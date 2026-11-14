import { requireStaff } from '@/features/khata/http';
import { counterOrderSchema } from '@/features/orders/schemas/counter-order.schema';
import { getOrderService } from '@/features/orders/server';
import { ok, parseBody, route } from '@/lib/http/response';

/**
 * Staff take an order at the counter: takeaway or dine in, paid in full, in part, or not at all.
 * Whatever isn't paid goes on the khata for the customer's number, within its limit.
 */
export const POST = route(async (request: Request) => {
  const session = await requireStaff(request);
  const body = await parseBody(request, counterOrderSchema);
  const order = await getOrderService().placeAtCounter(body, { staffUserId: session.userId });
  return ok({ order }, { status: order.replayed ? 200 : 201 });
});
