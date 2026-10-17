import { describe, expect, it } from 'vitest';
import { placeOrderSchema } from './place-order.schema';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = {
  idempotencyKey: uuid(1),
  expectedTotal: 760,
  orderType: 'PICKUP',
  lines: [{ kind: 'product', productId: uuid(2), quantity: 1 }],
  contact: { name: 'Ali Khan', phone: '0300-123 4567' },
};
const delivery = {
  ...base,
  orderType: 'DELIVERY',
  zoneId: uuid(3),
  address: { line1: 'House 12, Street 4' },
};

describe('placeOrderSchema', () => {
  it('accepts a pickup order and normalises the phone', () => {
    const parsed = placeOrderSchema.parse(base);
    expect(parsed.contact.phone).toBe('03001234567');
    expect(parsed.contact.email).toBeUndefined();
    expect(parsed.address).toBeUndefined();
    expect(parsed.couponCode).toBeNull();
  });

  it('accepts a delivery order with an address', () => {
    const parsed = placeOrderSchema.parse({
      ...delivery,
      address: { line1: '  House 12  ', line2: '   ' },
      instructions: '  ring twice ',
    });
    expect(parsed.address).toEqual({ line1: 'House 12', line2: undefined });
    expect(parsed.instructions).toBe('ring twice');
  });

  it('requires an address for delivery but not for pickup or dine-in', () => {
    const result = placeOrderSchema.safeParse({ ...delivery, address: undefined });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.join('.')).toBe('address.line1');
    expect(placeOrderSchema.safeParse({ ...base, orderType: 'DINE_IN' }).success).toBe(true);
  });

  it('treats blank optional fields as not provided', () => {
    const parsed = placeOrderSchema.parse({
      ...base,
      contact: { ...base.contact, email: '' },
      instructions: '',
    });
    expect(parsed.contact.email).toBeUndefined();
    expect(parsed.instructions).toBeUndefined();
  });

  it('lowercases and validates the email', () => {
    const parsed = placeOrderSchema.parse({
      ...base,
      contact: { ...base.contact, email: ' Ali@Example.COM ' },
    });
    expect(parsed.contact.email).toBe('ali@example.com');
    expect(
      placeOrderSchema.safeParse({ ...base, contact: { ...base.contact, email: 'nope' } }).success,
    ).toBe(false);
  });

  it.each([
    ['no idempotency key', { ...base, idempotencyKey: undefined }],
    ['non-uuid idempotency key', { ...base, idempotencyKey: 'abc' }],
    ['no expected total', { ...base, expectedTotal: undefined }],
    ['negative expected total', { ...base, expectedTotal: -1 }],
    ['absurd expected total', { ...base, expectedTotal: 1e12 }],
    ['short name', { ...base, contact: { ...base.contact, name: 'A' } }],
    ['bad phone', { ...base, contact: { ...base.contact, phone: '12345' } }],
    ['no contact', { ...base, contact: undefined }],
    ['short address', { ...delivery, address: { line1: 'ab' } }],
    ['very long instructions', { ...base, instructions: 'x'.repeat(501) }],
    [
      'a line with zero quantity',
      { ...base, lines: [{ kind: 'product', productId: uuid(2), quantity: 0 }] },
    ],
    ['unknown order type', { ...base, orderType: 'TELEPORT' }],
  ])('rejects %s', (_name, body) => {
    expect(placeOrderSchema.safeParse(body).success).toBe(false);
  });

  it('ignores any prices or totals the client tries to add to lines', () => {
    const parsed = placeOrderSchema.parse({
      ...base,
      lines: [{ kind: 'product', productId: uuid(2), quantity: 1, unitPrice: 1, price: 1 }],
      grandTotal: 1,
    });
    expect(JSON.stringify(parsed)).not.toContain('unitPrice');
    expect(JSON.stringify(parsed)).not.toContain('grandTotal');
  });
});
