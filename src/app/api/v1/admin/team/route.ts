import { requireAdmin } from '@/features/admin/http';
import { teamCreateSchema } from '@/features/admin/schemas/operations.schema';
import { operations } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return ok({ members: await operations.listTeam() });
});

export const POST = route(async (request: Request) => {
  const session = await requireAdmin(request);
  const id = await operations.createMember(
    { id: session.userId, role: session.role },
    await parseBody(request, teamCreateSchema),
  );
  return ok({ id }, { status: 201 });
});
