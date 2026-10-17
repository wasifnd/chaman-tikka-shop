import { requireSession } from '@/lib/auth/session';
import { ok, route } from '@/lib/http/response';

export const GET = route(async () => ok({ user: await requireSession() }));
