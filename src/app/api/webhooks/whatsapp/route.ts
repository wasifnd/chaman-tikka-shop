import { after } from 'next/server';
import {
  incomingTexts,
  isSignedByMeta,
  type VerificationConfig,
} from '@/features/verification/logic/whatsapp';
import { getVerificationConfig, verification } from '@/features/verification/server';
import { toInternational } from '@/lib/validation/phone';

/**
 * Meta's WhatsApp webhook. Set its callback URL to https://<site>/api/webhooks/whatsapp, its verify
 * token to WHATSAPP_VERIFY_TOKEN, and subscribe to "messages".
 */

const GRAPH_URL = 'https://graph.facebook.com/v23.0';

/** Meta checks the callback URL once by asking us to echo a challenge. */
export function GET(request: Request): Response {
  const config = getVerificationConfig();
  const params = new URL(request.url).searchParams;
  if (
    config.mode === 'whatsapp' &&
    params.get('hub.mode') === 'subscribe' &&
    params.get('hub.verify_token') === config.verifyToken
  ) {
    return new Response(params.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const config = getVerificationConfig();
  if (config.mode !== 'whatsapp') return new Response('Not found', { status: 404 });

  const raw = await request.text();
  if (!isSignedByMeta(raw, request.headers.get('x-hub-signature-256'), config.appSecret)) {
    return new Response('Bad signature', { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  for (const message of incomingTexts(payload)) {
    if (await verification.confirm(message.phone, message.text)) {
      const { reply } = config;
      if (reply) after(() => thank(reply, message.phone));
    }
  }
  // Always 200 for a signed call, or Meta keeps retrying messages that simply weren't codes.
  return new Response('OK', { status: 200 });
}

/** A short "you're verified" reply. Failures don't matter: the website already knows. */
async function thank(
  reply: NonNullable<Extract<VerificationConfig, { mode: 'whatsapp' }>['reply']>,
  phone: string,
): Promise<void> {
  try {
    await fetch(`${GRAPH_URL}/${reply.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${reply.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toInternational(phone),
        type: 'text',
        text: { body: 'Your number is verified. You can go back to Chaman Tikka Shop now.' },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error('WhatsApp reply failed', error);
  }
}
