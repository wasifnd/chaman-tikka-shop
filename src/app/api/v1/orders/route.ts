import { after } from 'next/server';
import { getEmailer, getOrderRepository, getOrderService } from '@/features/orders/server';
import { notifyOrderPlaced } from '@/features/orders/services/order-notify';
import { placeOrderSchema } from '@/features/orders/schemas/place-order.schema';
import { getSession } from '@/lib/auth/session';
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http/guards';
import { ok, parseBody, route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';
import { siteUrl } from '@/lib/site';

/**
 * Places an order. The body says what is in the cart and who to contact; the server prices it,
 * checks it, and either creates the order completely or not at all.
 */
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  await enforceRateLimit(getRateLimiter('orders-ip', 10, 600), clientIp(request.headers));

  const body = await parseBody(request, placeOrderSchema);
  // A second, tighter limit per phone number stops one person flooding the kitchen from many IPs.
  await enforceRateLimit(getRateLimiter('orders-phone', 3, 300), body.contact.phone);

  const session = await getSession();
  const placed = await getOrderService().place(body, { customerId: session?.customerId ?? null });

  if (!placed.replayed) {
    // After the response is sent, so a slow email provider never delays or fails the order.
    after(() =>
      notifyOrderPlaced(
        {
          findSnapshot: (token) => getOrderRepository().findSnapshot(token),
          emailer: getEmailer(),
          baseUrl: siteUrl(),
        },
        {
          trackingToken: placed.trackingToken,
          customerName: body.contact.name,
          email: body.contact.email,
        },
      ),
    );
  }

  return ok(
    {
      order: {
        orderNumber: placed.orderNumber,
        trackingToken: placed.trackingToken,
        status: placed.status,
        grandTotal: placed.grandTotal,
        estimatedReadyAt: placed.estimatedReadyAt,
      },
    },
    { status: placed.replayed ? 200 : 201 },
  );
});
