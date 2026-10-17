import { z } from 'zod';
import { getOrderRepository } from '@/features/orders/server';
import { orderEventFrames, parseResumePosition } from '@/features/orders/services/order-stream';
import { AppError } from '@/lib/errors';
import { clientIp, enforceRateLimit } from '@/lib/http/guards';
import { route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ token: string }> };

/**
 * Live order updates as Server-Sent Events. A connection lasts about 25 seconds and then ends;
 * the browser reconnects by itself, telling us the last event it saw, so nothing is missed.
 */
export const GET = route(async (request: Request, { params }: Context) => {
  await enforceRateLimit(getRateLimiter('track-stream', 30, 60), clientIp(request.headers));

  const token = z.uuid().safeParse((await params).token);
  const repository = getOrderRepository();
  const orderId = token.success ? await repository.findOrderId(token.data) : null;
  if (!orderId) throw new AppError('ORDER_NOT_FOUND', 'We could not find that order.', 404);

  const url = new URL(request.url);
  const resumeFrom = parseResumePosition(
    request.headers.get('last-event-id'),
    url.searchParams.get('after'),
  );

  let aborted = request.signal.aborted;
  request.signal.addEventListener('abort', () => {
    aborted = true;
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const frames = orderEventFrames(resumeFrom, {
          fetchEvents: (afterId) => repository.eventsAfter(orderId, afterId),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          now: () => Date.now(),
          aborted: () => aborted,
        });
        for await (const frame of frames) controller.enqueue(encoder.encode(frame));
      } finally {
        controller.close();
      }
    },
    cancel() {
      aborted = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      // Stops proxies such as nginx from buffering the stream.
      'X-Accel-Buffering': 'no',
    },
  });
});
