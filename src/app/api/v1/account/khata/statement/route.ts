import { statementResponse } from '@/features/khata/http';
import { khataRepository } from '@/features/khata/server';
import { requireSession } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/http/response';

/** The customer's own khata statement, as a PDF or (?format=csv) a spreadsheet. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const khata = await khataRepository.findForUser(session.userId);
  if (!khata) throw new AppError('KHATA_NOT_FOUND', 'You have no khata with us.', 404);
  return statementResponse(request, khata);
});
