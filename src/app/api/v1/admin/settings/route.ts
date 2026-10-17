import { requireAdmin } from '@/features/admin/http';
import { settingsUpdateSchema } from '@/features/admin/schemas/operations.schema';
import { operations } from '@/features/admin/server';
import { ok, parseBody, route } from '@/lib/http/response';

export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  return ok(await operations.getSettings());
});

export const PUT = route(async (request: Request) => {
  await requireAdmin(request);
  await operations.saveSettings(await parseBody(request, settingsUpdateSchema));
  return ok({});
});
