import { khataId, requireStaff, type IdContext } from '@/features/khata/http';
import { khataRepository } from '@/features/khata/server';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http/response';

/** One khata with every entry and who made it. */
export const GET = route(async (request: Request, context: IdContext) => {
  await requireStaff(request);
  const khata = await khataRepository.findById(await khataId(context));
  if (!khata) throw new AppError('KHATA_NOT_FOUND', 'That khata does not exist.', 404);
  return ok({ khata });
});
