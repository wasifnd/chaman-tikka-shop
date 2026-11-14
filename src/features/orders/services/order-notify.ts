import { siteConfig } from '@/lib/site';
import type { OrderSnapshot } from '../types/snapshot.types';
import {
  buildOrderConfirmationEmail,
  sendBestEffort,
  type EmailAttachment,
  type Emailer,
} from './order-email';

export interface NotifyDeps {
  findSnapshot: (token: string) => Promise<OrderSnapshot | null>;
  emailer: Emailer;
  baseUrl: string;
  /** The receipt PDF to attach; the email still goes out without it if this fails. */
  receipt?: (token: string) => Promise<EmailAttachment | null>;
}

export interface NotifyInput {
  trackingToken: string;
  customerName: string;
  email: string | undefined;
}

/**
 * Sends the confirmation email for a placed order. It runs after the order is saved, only when the
 * customer gave an email, and a failure here never affects the order.
 */
export async function notifyOrderPlaced(
  { findSnapshot, emailer, baseUrl, receipt }: NotifyDeps,
  { trackingToken, customerName, email }: NotifyInput,
): Promise<boolean> {
  if (!email) return false;
  try {
    const order = await findSnapshot(trackingToken);
    if (!order) return false;
    const attachment = receipt ? await receipt(trackingToken).catch(logReceiptFailure) : null;
    return await sendBestEffort(emailer, {
      ...buildOrderConfirmationEmail({
        order,
        customerName,
        to: email,
        trackingUrl: `${baseUrl}/track/${trackingToken}`,
        restaurantName: siteConfig.name,
      }),
      ...(attachment ? { attachments: [attachment] } : {}),
    });
  } catch (error) {
    console.error('Could not prepare order confirmation email', error);
    return false;
  }
}

function logReceiptFailure(error: unknown): null {
  console.error('Could not attach the receipt; sending the email without it', error);
  return null;
}
