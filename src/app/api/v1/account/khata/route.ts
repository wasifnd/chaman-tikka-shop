import { requireSession } from '@/lib/auth/session';
import { khataRepository } from '@/features/khata/server';
import { ok, route } from '@/lib/http/response';

/** The signed-in customer's own khata (null when they have none). Read-only. */
export const GET = route(async () => {
  const session = await requireSession();
  return ok({ khata: await khataRepository.findForUser(session.userId) });
});
