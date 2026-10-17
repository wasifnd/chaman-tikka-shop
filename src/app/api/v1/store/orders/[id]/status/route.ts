import { z } from 'zod';
import { transitionRequestSchema } from '@/features/store-panel/schemas/transition.schema';
import { getTransitionService } from '@/features/store-panel/server';
import { STAFF_ROLES } from '@/lib/auth/roles';
import { requireSession } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/http/guards';
import { ok, parseBody, route } from '@/lib/http/response';

type Context = { params: Promise<{ id: string }> };

/** Moves an order to its next status. Staff only; the change is recorded against the signed-in user. */
export const PATCH = route(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const session = await requireSession(STAFF_ROLES);

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new AppError('ORDER_NOT_FOUND', 'That order does not exist.', 404);

  const body = await parseBody(request, transitionRequestSchema);
  const result = await getTransitionService().transition(id.data, body, { userId: session.userId });
  return ok({ result });
});
