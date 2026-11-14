import { describe, expect, it, vi } from 'vitest';
import type { OrderSnapshot } from '../types/snapshot.types';
import type { Email } from './order-email';
import { notifyOrderPlaced } from './order-notify';

const order: OrderSnapshot = {
  orderNumber: 'BBQ-2026-0001',
  status: 'RECEIVED',
  type: 'PICKUP',
  createdAt: '2026-10-16T14:00:00.000Z',
  estimatedReadyAt: null,
  areaName: null,
  items: [{ name: 'Naan', options: [], quantity: 2, lineTotal: 60 }],
  subtotal: 60,
  couponDiscount: 0,
  deliveryCharge: 0,
  taxAmount: 0,
  grandTotal: 60,
  timeline: [],
  lastEventId: 1,
  serverTime: '2026-10-16T14:00:00.000Z',
};

function setup(found: OrderSnapshot | null = order) {
  const sent: Email[] = [];
  const deps = {
    findSnapshot: vi.fn(() => Promise.resolve(found)),
    emailer: {
      send: vi.fn((email: Email) => {
        sent.push(email);
        return Promise.resolve();
      }),
    },
    baseUrl: 'https://bbqstore.pk',
  };
  return { deps, sent };
}

const input = { trackingToken: 'token-123', customerName: 'Ali', email: 'ali@example.com' };

describe('notifyOrderPlaced', () => {
  it('emails the customer a link to track their order', async () => {
    const { deps, sent } = setup();
    expect(await notifyOrderPlaced(deps, input)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'ali@example.com' });
    expect(sent[0]?.text).toContain('https://bbqstore.pk/track/token-123');
    expect(sent[0]?.subject).toContain('BBQ-2026-0001');
  });

  it('sends nothing when the customer gave no email', async () => {
    const { deps, sent } = setup();
    expect(await notifyOrderPlaced(deps, { ...input, email: undefined })).toBe(false);
    expect(sent).toHaveLength(0);
    expect(deps.findSnapshot).not.toHaveBeenCalled();
  });

  it('sends nothing if the order cannot be found', async () => {
    const { deps, sent } = setup(null);
    expect(await notifyOrderPlaced(deps, input)).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('survives an email provider failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps } = setup();
    deps.emailer.send.mockRejectedValueOnce(new Error('provider down'));
    await expect(notifyOrderPlaced(deps, input)).resolves.toBe(false);
    spy.mockRestore();
  });

  it('survives a database failure while preparing the email', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps } = setup();
    deps.findSnapshot.mockRejectedValueOnce(new Error('db down'));
    await expect(notifyOrderPlaced(deps, input)).resolves.toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('attaches the receipt PDF when one is available', async () => {
    const { deps, sent } = setup();
    const receipt = vi.fn(() =>
      Promise.resolve({
        filename: 'receipt-BBQ-2026-0001.pdf',
        content: new Uint8Array([1, 2, 3]),
      }),
    );
    expect(await notifyOrderPlaced({ ...deps, receipt }, input)).toBe(true);
    expect(receipt).toHaveBeenCalledWith('token-123');
    expect(sent[0]?.attachments).toEqual([
      { filename: 'receipt-BBQ-2026-0001.pdf', content: new Uint8Array([1, 2, 3]) },
    ]);
  });

  it('still sends the email when the receipt cannot be made', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps, sent } = setup();
    const receipt = vi.fn(() => Promise.reject(new Error('pdf failed')));
    expect(await notifyOrderPlaced({ ...deps, receipt }, input)).toBe(true);
    expect(sent[0]?.attachments).toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('sends no attachment when the receipt is missing', async () => {
    const { deps, sent } = setup();
    expect(await notifyOrderPlaced({ ...deps, receipt: () => Promise.resolve(null) }, input)).toBe(
      true,
    );
    expect(sent[0]?.attachments).toBeUndefined();
  });
});
