import { requireStaff } from '@/features/khata/http';
import { listQuerySchema } from '@/features/khata/schemas/khata.schema';
import { khataRepository } from '@/features/khata/server';
import { ok, route } from '@/lib/http/response';

/** Khatas, biggest balance first. ?q= searches number or name; ?all=1 includes paid-up ones. */
export const GET = route(async (request: Request) => {
  await requireStaff(request);
  const query = listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(
    await khataRepository.list({ search: query.q, owingOnly: !query.all, page: query.page }),
  );
});
