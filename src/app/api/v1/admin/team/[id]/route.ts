import { parseId, requireAdmin, type IdContext } from '@/features/admin/http';
import { teamUpdateSchema } from '@/features/admin/schemas/operations.schema';
import { operations } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const PATCH = route(async (request: Request, { params }: IdContext) => {
  const session = await requireAdmin(request);
  const id = parseId((await params).id, 'MEMBER_NOT_FOUND', 'That account does not exist.');
  await operations.updateMember(
    { id: session.userId, role: session.role },
    id,
    await parseBody(request, teamUpdateSchema),
  );
  return ok({});
});
