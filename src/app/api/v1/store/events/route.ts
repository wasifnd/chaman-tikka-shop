import { getStaffOrdersRepository } from '@/features/store-panel/server';
import { orderEventFrames, parseResumePosition } from '@/features/orders/services/order-stream';
import { STAFF_ROLES } from '@/lib/auth/roles';
import { requireSession } from '@/lib/auth/session';
import { clientIp, enforceRateLimit } from '@/lib/http/guards';
import { route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Live feed of every order change, for the store panel. Like the customer stream it lasts about 25
 * seconds and the browser reconnects, resuming from the last event it saw.
 */
export const GET = route(async (request: Request) => {
  await requireSession(STAFF_ROLES);
  await enforceRateLimit(getRateLimiter('store-stream', 30, 60), clientIp(request.headers));

  const repository = getStaffOrdersRepository();
  const resumeFrom = parseResumePosition(
    request.headers.get('last-event-id'),
    new URL(request.url).searchParams.get('after'),
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
          fetchEvents: (afterId) => repository.eventsSince(afterId),
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
      'X-Accel-Buffering': 'no',
    },
  });
});
