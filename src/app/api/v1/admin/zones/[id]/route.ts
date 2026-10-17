import { zoneInputSchema } from '@/features/admin/schemas/operations.schema';
import { parseId, requireAdmin, type IdContext } from '@/features/admin/http';
import { operations } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const PATCH = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'ZONE_NOT_FOUND', 'That delivery area does not exist.');
  await operations.updateZone(id, await parseBody(request, zoneInputSchema));
  return ok({});
});

export const DELETE = route(async (request: Request, { params }: IdContext) => {
  await requireAdmin(request);
  const id = parseId((await params).id, 'ZONE_NOT_FOUND', 'That delivery area does not exist.');
  const outcome = await operations.removeZone(id);
  return ok({ outcome });
});
