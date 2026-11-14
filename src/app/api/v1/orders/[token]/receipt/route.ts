import { z } from 'zod';
import { canSeeFullReceipt, redactForLink } from '@/features/orders/receipt/receipt-data';
import { receiptResponse } from '@/features/orders/receipt/receipt.repository';
import { khataRepository } from '@/features/khata/server';
import { getReceiptRepository } from '@/features/orders/server';
import { getSession } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { clientIp, enforceRateLimit } from '@/lib/http/guards';
import { route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';

type Context = { params: Promise<{ token: string }> };

/**
 * The order's receipt as a PDF, for whoever holds the tracking link. The customer's own account
 * and the shop's staff get every detail; anyone else gets the copy without the street address,
 * email or full phone number, because tracking links get forwarded. Add ?download=1 to save it.
 */
export const GET = route(async (request: Request, { params }: Context) => {
  await enforceRateLimit(getRateLimiter('receipt', 30, 60), clientIp(request.headers));

  const token = z.uuid().safeParse((await params).token);
  const found = token.success
    ? await getReceiptRepository().find({ trackingToken: token.data })
    : null;
  if (!found) throw new AppError('ORDER_NOT_FOUND', 'We could not find that order.', 404);

  const session = await getSession();
  const full =
    canSeeFullReceipt(found.customerId, session) ||
    // A counter order left on a khata is also the khata owner's to see in full.
    (session !== null &&
      found.khataPhone !== null &&
      (await khataRepository.verifiedPhone(session.userId)) === found.khataPhone);
  const download = new URL(request.url).searchParams.get('download') === '1';
  return receiptResponse(full ? found.receipt : redactForLink(found.receipt), download);
});
