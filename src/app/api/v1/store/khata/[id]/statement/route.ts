import { khataId, requireStaff, statementResponse, type IdContext } from '@/features/khata/http';
import { khataRepository } from '@/features/khata/server';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/http/response';

/** The khata statement as a PDF, or a spreadsheet with ?format=csv. */
export const GET = route(async (request: Request, context: IdContext) => {
  await requireStaff(request);
  const khata = await khataRepository.findById(await khataId(context));
  if (!khata) throw new AppError('KHATA_NOT_FOUND', 'That khata does not exist.', 404);
  return statementResponse(request, khata);
});
