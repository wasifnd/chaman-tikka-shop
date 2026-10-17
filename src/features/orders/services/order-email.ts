import { formatPrice } from '@/shared/utils/format';
import type { OrderSnapshot } from '../types/snapshot.types';

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Emailer {
  send(email: Email): Promise<void>;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Customer-supplied text (name, item notes) goes into HTML, so it must never be trusted. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

const TYPE_LABEL = { DELIVERY: 'Delivery', PICKUP: 'Pickup', DINE_IN: 'Dine in' } as const;

interface ConfirmationInput {
  order: OrderSnapshot;
  customerName: string;
  to: string;
  trackingUrl: string;
  restaurantName: string;
}

export function buildOrderConfirmationEmail({
  order,
  customerName,
  to,
  trackingUrl,
  restaurantName,
}: ConfirmationInput): Email {
  const subject = `Order ${order.orderNumber} received - ${restaurantName}`;
  const ready = order.estimatedReadyAt
    ? new Intl.DateTimeFormat('en-PK', {
        timeStyle: 'short',
        timeZone: 'Asia/Karachi',
      }).format(new Date(order.estimatedReadyAt))
    : null;

  const totals: [string, string][] = [['Subtotal', formatPrice(order.subtotal)]];
  if (order.couponDiscount > 0)
    totals.push(['Coupon discount', `-${formatPrice(order.couponDiscount)}`]);
  if (order.type === 'DELIVERY') {
    totals.push([
      'Delivery',
      order.deliveryCharge === 0 ? 'Free' : formatPrice(order.deliveryCharge),
    ]);
  }
  if (order.taxAmount > 0) totals.push(['Tax', formatPrice(order.taxAmount)]);
  totals.push(['Total', formatPrice(order.grandTotal)]);

  const where = order.type === 'DELIVERY' && order.areaName ? ` to ${order.areaName}` : '';
  const payment =
    order.type === 'DELIVERY'
      ? 'Pay in cash when your order arrives.'
      : 'Pay in cash at the counter.';

  const text = [
    `Hi ${customerName},`,
    '',
    `Thanks for your order! We have received order ${order.orderNumber}.`,
    `${TYPE_LABEL[order.type]}${where}${ready ? `, ready around ${ready}` : ''}.`,
    '',
    ...order.items.flatMap((item) => [
      `${String(item.quantity)} x ${item.name} - ${formatPrice(item.lineTotal)}`,
      ...item.options.map((option) => `   ${option}`),
    ]),
    '',
    ...totals.map(([label, value]) => `${label}: ${value}`),
    '',
    payment,
    `Track your order: ${trackingUrl}`,
  ].join('\n');

  const rows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:4px 0">${String(item.quantity)} × ${escapeHtml(item.name)}${
          item.options.length > 0
            ? `<br><span style="color:#666;font-size:13px">${escapeHtml(item.options.join(', '))}</span>`
            : ''
        }</td>
        <td style="padding:4px 0;text-align:right;white-space:nowrap">${formatPrice(item.lineTotal)}</td>
      </tr>`,
    )
    .join('');
  const totalRows = totals
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:2px 0${label === 'Total' ? ';font-weight:bold' : ''}">${label}</td>
        <td style="padding:2px 0;text-align:right${label === 'Total' ? ';font-weight:bold' : ''}">${escapeHtml(value)}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#222;max-width:520px;margin:0 auto;padding:16px">
  <h1 style="font-size:20px">Thanks, ${escapeHtml(customerName)}!</h1>
  <p>We have received order <strong>${escapeHtml(order.orderNumber)}</strong>.
     ${TYPE_LABEL[order.type]}${escapeHtml(where)}${ready ? `, ready around <strong>${escapeHtml(ready)}</strong>` : ''}.</p>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #ddd;border-bottom:1px solid #ddd;margin:16px 0">${rows}</table>
  <table style="width:100%;border-collapse:collapse">${totalRows}</table>
  <p>${payment}</p>
  <p><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background:#e8541e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Track your order</a></p>
  <p style="color:#888;font-size:12px">${escapeHtml(restaurantName)}</p>
</body></html>`;

  return { to, subject, html, text };
}

export interface ResendOptions {
  apiKey: string;
  from: string;
  fetcher?: typeof fetch;
}

/** Sends through Resend's HTTP API. Throws on failure so the caller can log it. */
export function createResendEmailer({ apiKey, from, fetcher = fetch }: ResendOptions): Emailer {
  return {
    async send({ to, subject, html, text }) {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
      });
      if (!response.ok) {
        throw new Error(`Email provider rejected the message (${String(response.status)})`);
      }
    },
  };
}

/** Used when no email provider is configured (local development). */
export function createNoopEmailer(): Emailer {
  return { send: () => Promise.resolve() };
}

/**
 * Emails must never fail an order that is already placed, so errors are logged and swallowed.
 */
export async function sendBestEffort(emailer: Emailer, email: Email): Promise<boolean> {
  try {
    await emailer.send(email);
    return true;
  } catch (error) {
    console.error('Could not send order confirmation email', error);
    return false;
  }
}
