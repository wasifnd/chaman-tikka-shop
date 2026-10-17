import { getStaffOrdersRepository } from '@/features/store-panel/server';
import { STAFF_ROLES } from '@/lib/auth/roles';
import { requireSession } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/response';

export const dynamic = 'force-dynamic';

/** How far back "recently finished" looks. */
const FINISHED_WINDOW_HOURS = 12;

/**
 * Orders for the store panel. Contains customers' names, phones and addresses, so it is staff-only
 * and never cached.
 */
export const GET = route(async (request: Request) => {
  await requireSession(STAFF_ROLES);
  const repository = getStaffOrdersRepository();
  const scope =
    new URL(request.url).searchParams.get('scope') === 'finished' ? 'finished' : 'active';

  // Read the event position first: any change after this point is replayed by the live stream,
  // so a screen that loads and then connects never misses an update.
  const lastEventId = await repository.latestEventId();
  const orders =
    scope === 'finished'
      ? await repository.listRecentlyFinished(
          new Date(Date.now() - FINISHED_WINDOW_HOURS * 3_600_000),
        )
      : await repository.listActive();

  return ok(
    { orders, lastEventId, serverTime: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
