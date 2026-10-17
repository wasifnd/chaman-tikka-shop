import { describe, expect, it, vi } from 'vitest';
import type { OrderSnapshot } from '../types/snapshot.types';
import {
  buildOrderConfirmationEmail,
  createNoopEmailer,
  createResendEmailer,
  escapeHtml,
  sendBestEffort,
} from './order-email';

const order: OrderSnapshot = {
  orderNumber: 'BBQ-2026-0042',
  status: 'RECEIVED',
  type: 'DELIVERY',
  createdAt: '2026-10-16T14:00:00.000Z',
  estimatedReadyAt: '2026-10-16T14:30:00.000Z',
  areaName: 'Johar Town',
  items: [
    { name: 'Chicken Tikka', options: ['Half', 'Raita'], quantity: 2, lineTotal: 1460 },
    { name: 'Naan', options: [], quantity: 1, lineTotal: 30 },
  ],
  subtotal: 1490,
  couponDiscount: 100,
  deliveryCharge: 100,
  taxAmount: 0,
  grandTotal: 1490,
  timeline: [],
  lastEventId: 1,
  serverTime: '2026-10-16T14:00:00.000Z',
};

const build = (overrides: Partial<OrderSnapshot> = {}, name = 'Ali Khan') =>
  buildOrderConfirmationEmail({
    order: { ...order, ...overrides },
    customerName: name,
    to: 'ali@example.com',
    trackingUrl: 'https://bbqstore.pk/track/abc',
    restaurantName: 'BBQ Store',
  });

describe('escapeHtml', () => {
  it('escapes the characters that can break out of HTML', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
  });

  it('leaves safe text alone', () => {
    expect(escapeHtml('Ali Khan 123')).toBe('Ali Khan 123');
  });
});

describe('buildOrderConfirmationEmail', () => {
  it('addresses the right person and mentions the order number in the subject', () => {
    const email = build();
    expect(email.to).toBe('ali@example.com');
    expect(email.subject).toBe('Order BBQ-2026-0042 received - BBQ Store');
  });

  it('lists items, options, totals, payment and the tracking link in the text version', () => {
    const { text } = build();
    expect(text).toContain('2 x Chicken Tikka - Rs. 1,460');
    expect(text).toContain('   Half');
    expect(text).toContain('Coupon discount: -Rs. 100');
    expect(text).toContain('Delivery: Rs. 100');
    expect(text).toContain('Total: Rs. 1,490');
    expect(text).toContain('Pay in cash when your order arrives.');
    expect(text).toContain('Track your order: https://bbqstore.pk/track/abc');
    expect(text).toContain('to Johar Town');
    expect(text).toContain('ready around');
  });

  it('shows the ready time in Lahore time', () => {
    // 14:30 UTC is 19:30 in Lahore.
    expect(build().text).toMatch(/7:30\s?pm/i);
  });

  it('says free delivery, and omits delivery for pickup', () => {
    expect(build({ deliveryCharge: 0 }).text).toContain('Delivery: Free');
    const pickup = build({ type: 'PICKUP', areaName: null });
    expect(pickup.text).not.toContain('Delivery:');
    expect(pickup.text).toContain('Pay in cash at the counter.');
    expect(pickup.text).not.toContain(' to Johar Town');
  });

  it('shows tax only when there is some, and omits the discount when there is none', () => {
    expect(build({ taxAmount: 50 }).text).toContain('Tax: Rs. 50');
    expect(build().text).not.toContain('Tax:');
    expect(build({ couponDiscount: 0 }).text).not.toContain('Coupon discount');
  });

  it('copes with no ready estimate', () => {
    const email = build({ estimatedReadyAt: null });
    expect(email.text).not.toContain('ready around');
    expect(email.html).not.toContain('ready around');
  });

  it('escapes a hostile customer name and item names in the HTML', () => {
    const email = build(
      {
        items: [
          {
            name: '<img src=x onerror=alert(1)>',
            options: ['<b>x</b>'],
            quantity: 1,
            lineTotal: 10,
          },
        ],
      },
      '<script>steal()</script>',
    );
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('<b>x</b>');
    expect(email.html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
  });

  it('escapes the tracking URL inside the link', () => {
    const email = buildOrderConfirmationEmail({
      order,
      customerName: 'Ali',
      to: 'a@b.pk',
      trackingUrl: 'https://x.test/?a=1&b="2"',
      restaurantName: 'BBQ Store',
    });
    expect(email.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });

  it('includes item totals and a track button in the HTML', () => {
    const { html } = build();
    expect(html).toContain('2 × Chicken Tikka');
    expect(html).toContain('Rs. 1,460');
    expect(html).toContain('Track your order');
    expect(html).toContain('Half, Raita');
  });
});

describe('createResendEmailer', () => {
  const email = { to: 'a@b.pk', subject: 'S', html: '<p>x</p>', text: 'x' };

  it('posts the message with the API key', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 200 })));
    await createResendEmailer({ apiKey: 're_123', from: 'orders@bbqstore.pk', fetcher }).send(
      email,
    );

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer re_123');
    const body = init?.body;
    expect(JSON.parse(typeof body === 'string' ? body : '{}')).toEqual({
      from: 'orders@bbqstore.pk',
      to: ['a@b.pk'],
      subject: 'S',
      html: '<p>x</p>',
      text: 'x',
    });
  });

  it('throws without leaking the API key when the provider refuses', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('no', { status: 422 })));
    const emailer = createResendEmailer({ apiKey: 're_secret', from: 'x@y.pk', fetcher });
    const error = await emailer.send(email).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toContain('422');
    expect(error?.message).not.toContain('re_secret');
  });
});

describe('createNoopEmailer and sendBestEffort', () => {
  const email = { to: 'a@b.pk', subject: 'S', html: '', text: '' };

  it('does nothing quietly', async () => {
    await expect(createNoopEmailer().send(email)).resolves.toBeUndefined();
  });

  it('reports success', async () => {
    expect(await sendBestEffort({ send: () => Promise.resolve() }, email)).toBe(true);
  });

  it('swallows and logs failures so an order is never undone by an email problem', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok = await sendBestEffort(
      { send: () => Promise.reject(new Error('provider down')) },
      email,
    );
    expect(ok).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
