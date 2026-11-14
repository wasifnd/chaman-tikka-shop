import { requireAdmin } from '@/features/admin/http';
import { khataId, type IdContext } from '@/features/khata/http';
import { adjustmentSchema } from '@/features/khata/schemas/khata.schema';
import { khataService } from '@/features/khata/server';
import { ok, parseBody, route } from '@/lib/http/response';

/** Admin corrections: add a charge, take some off, or write off the balance. A reason is required. */
export const POST = route(async (request: Request, context: IdContext) => {
  const session = await requireAdmin(request);
  const id = await khataId(context);
  const body = await parseBody(request, adjustmentSchema);
  const change = await khataService.adjust(id, body, session.userId);
  return ok({ change }, { status: change.replayed ? 200 : 201 });
});
