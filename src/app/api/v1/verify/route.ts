import { startVerificationSchema } from '@/features/verification/schemas/verification.schema';
import { getVerificationConfig, verification } from '@/features/verification/server';
import { whatsappLink } from '@/features/verification/logic/whatsapp';
import { AppError } from '@/lib/errors';
import { assertSameOrigin, clientIp, enforceRateLimit } from '@/lib/http/guards';
import { ok, parseBody, route } from '@/lib/http/response';
import { getRateLimiter } from '@/lib/rate-limit';

/**
 * Starts proving a phone number: returns a code for the customer to send us on WhatsApp from that
 * phone. The page then asks GET /api/v1/verify/{id} until the message has arrived.
 */
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  const config = getVerificationConfig();
  if (config.mode === 'off') {
    throw new AppError(
      'VERIFICATION_UNAVAILABLE',
      'Phone verification is not set up yet. Please call us to order.',
      503,
    );
  }
  await enforceRateLimit(getRateLimiter('verify-ip', 10, 600), clientIp(request.headers));
  const { phone } = await parseBody(request, startVerificationSchema);
  await enforceRateLimit(getRateLimiter('verify-phone', 5, 600), phone);

  const started = await verification.start(phone);
  return ok(
    {
      id: started.id,
      code: started.code,
      expiresAt: started.expiresAt.toISOString(),
      mode: config.mode,
      ...(config.mode === 'whatsapp'
        ? {
            whatsappUrl: whatsappLink(config.businessNumber, started.code),
            businessNumber: `+${config.businessNumber}`,
          }
        : {}),
    },
    { status: 201 },
  );
});
