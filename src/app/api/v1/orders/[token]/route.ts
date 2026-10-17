import { z } from 'zod';
import { getOrderRepository } from '@/features/orders/server';
import { AppError } from '@/lib/errors';
import { clientIp, enforceRateLimit } from '@/lib/http/guards';
import { ok, route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';

type Context = { params: Promise<{ token: string }> };

/** The tracking snapshot for whoever holds the unguessable link. Contains no personal details. */
export const GET = route(async (request: Request, { params }: Context) => {
  await enforceRateLimit(getRateLimiter('track', 120, 60), clientIp(request.headers));

  const token = z.uuid().safeParse((await params).token);
  // A malformed token can't exist, so skip the database and answer exactly like a missing order.
  const snapshot = token.success ? await getOrderRepository().findSnapshot(token.data) : null;
  if (!snapshot) throw new AppError('ORDER_NOT_FOUND', 'We could not find that order.', 404);

  return ok({ order: snapshot }, { headers: { 'Cache-Control': 'no-store' } });
});
