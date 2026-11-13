import { verification } from '@/features/verification/server';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http/response';

type Context = { params: Promise<{ id: string }> };

/** Whether the customer's WhatsApp message has arrived yet: pending, verified or expired. */
export const GET = route(async (_request: Request, { params }: Context) => {
  const status = await verification.status((await params).id);
  if (!status) throw new AppError('VERIFICATION_NOT_FOUND', 'That check does not exist.', 404);
  return ok({ status }, { headers: { 'Cache-Control': 'no-store' } });
});
