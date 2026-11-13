import { getVerificationConfig, verification } from '@/features/verification/server';
import { AppError } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/http/guards';
import { ok, route } from '@/lib/http/response';

type Context = { params: Promise<{ id: string }> };

/**
 * Local development only: stands in for sending the WhatsApp message. It does not exist on a site
 * with WhatsApp set up or on a live site, where it would let anyone claim any number.
 */
export const POST = route(async (request: Request, { params }: Context) => {
  if (getVerificationConfig().mode !== 'dev') {
    throw new AppError('NOT_FOUND', 'Not found.', 404);
  }
  assertSameOrigin(request);
  if (!(await verification.confirmById((await params).id))) {
    throw new AppError('VERIFICATION_CLOSED', 'This check has expired. Start again.', 409);
  }
  return ok({ status: 'verified' });
});
