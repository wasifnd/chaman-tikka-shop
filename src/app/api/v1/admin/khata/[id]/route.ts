import { requireAdmin } from '@/features/admin/http';
import { khataId, type IdContext } from '@/features/khata/http';
import { limitSchema } from '@/features/khata/schemas/khata.schema';
import { khataRepository } from '@/features/khata/server';
import { AppError } from '@/lib/errors';
import { ok, parseBody, route } from '@/lib/http/response';

/** Admin sets this customer's own limit, or clears it (null) to use the shop's default. */
export const PATCH = route(async (request: Request, context: IdContext) => {
  await requireAdmin(request);
  const id = await khataId(context);
  const { creditLimit } = await parseBody(request, limitSchema);
  if (!(await khataRepository.setLimit(id, creditLimit))) {
    throw new AppError('KHATA_NOT_FOUND', 'That khata does not exist.', 404);
  }
  return ok({});
});
