import { quoteRequestSchema } from '@/features/checkout/schemas/quote.schema';
import { getQuoteService } from '@/features/checkout/server';
import { getSession } from '@/lib/auth/session';
import { clientIp, enforceRateLimit } from '@/lib/http/guards';
import { ok, parseBody, route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';

/**
 * Prices a cart on the server. The browser only says WHAT is in the cart; every price,
 * discount, fee and rule comes from the database, never from the request.
 */
export const POST = route(async (request: Request) => {
  await enforceRateLimit(getRateLimiter('quote', 60, 60), clientIp(request.headers));

  const body = await parseBody(request, quoteRequestSchema);
  const session = await getSession();
  const quote = await getQuoteService().quote({
    ...body,
    customerId: session?.customerId ?? null,
  });
  return ok({ quote });
});
