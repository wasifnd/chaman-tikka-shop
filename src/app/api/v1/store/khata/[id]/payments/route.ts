import { khataId, requireStaff, type IdContext } from '@/features/khata/http';
import { paymentSchema } from '@/features/khata/schemas/khata.schema';
import { khataService } from '@/features/khata/server';
import { ok, parseBody, route } from '@/lib/http/response';

/** The customer paid towards their khata. Recorded against the signed-in staff member. */
export const POST = route(async (request: Request, context: IdContext) => {
  const session = await requireStaff(request);
  const id = await khataId(context);
  const body = await parseBody(request, paymentSchema);
  const change = await khataService.recordPayment(id, body, session.userId);
  return ok({ change }, { status: change.replayed ? 200 : 201 });
});
