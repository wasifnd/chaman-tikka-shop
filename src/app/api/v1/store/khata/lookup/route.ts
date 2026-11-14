import { requireStaff } from '@/features/khata/http';
import { khataRepository } from '@/features/khata/server';
import { ok, route } from '@/lib/http/response';
import { normalizePhone } from '@/lib/validation/phone';

/** The counter's check when a number is typed: is there a khata, whose, and how much room is left. */
export const GET = route(async (request: Request) => {
  await requireStaff(request);
  const phone = normalizePhone(new URL(request.url).searchParams.get('phone') ?? '');
  if (!phone) return ok({ khata: null, defaultLimit: await khataRepository.defaultLimit() });
  const [khata, defaultLimit] = await Promise.all([
    khataRepository.findByPhone(phone),
    khataRepository.defaultLimit(),
  ]);
  return ok({ khata, defaultLimit });
});
