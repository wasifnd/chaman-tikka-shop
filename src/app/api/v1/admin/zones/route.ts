import { zoneInputSchema } from '@/features/admin/schemas/operations.schema';
import { requireAdmin } from '@/features/admin/http';
import { operations } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return ok({ zones: await operations.listZones() });
});

export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const input = await parseBody(request, zoneInputSchema);
  const id = await operations.createZone(input);
  return ok({ id }, { status: 201 });
});
