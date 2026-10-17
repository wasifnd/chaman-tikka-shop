import { describe, expect, it } from 'vitest';
import { MAX_CART_LINES, MAX_LINE_QUANTITY, quoteRequestSchema } from './quote.schema';

const uuid = '11111111-1111-4111-8111-111111111111';
const line = { kind: 'product', productId: uuid, quantity: 1 };
const valid = { lines: [line], orderType: 'PICKUP' };

describe('quoteRequestSchema', () => {
  it('accepts a minimal request and fills option defaults', () => {
    const parsed = quoteRequestSchema.parse(valid);
    expect(parsed.lines[0]).toMatchObject({ variantIds: [], addonIds: [] });
    expect(parsed.couponCode).toBeNull();
  });

  it('accepts deals and trims coupon codes and notes', () => {
    const parsed = quoteRequestSchema.parse({
      lines: [
        { ...line, note: '  no onions  ' },
        { kind: 'deal', dealId: uuid, quantity: 2 },
      ],
      orderType: 'DELIVERY',
      zoneId: uuid,
      couponCode: '  save100 ',
    });
    expect(parsed.couponCode).toBe('save100');
    expect(parsed.lines[0]).toMatchObject({ note: 'no onions' });
  });

  it('treats an empty or null coupon as none', () => {
    expect(quoteRequestSchema.parse({ ...valid, couponCode: '' }).couponCode).toBeNull();
    expect(quoteRequestSchema.parse({ ...valid, couponCode: null }).couponCode).toBeNull();
    expect(quoteRequestSchema.parse({ ...valid, couponCode: '   ' }).couponCode).toBeNull();
  });

  it.each([
    ['zero quantity', { ...valid, lines: [{ ...line, quantity: 0 }] }],
    ['fractional quantity', { ...valid, lines: [{ ...line, quantity: 1.5 }] }],
    ['negative quantity', { ...valid, lines: [{ ...line, quantity: -1 }] }],
    ['huge quantity', { ...valid, lines: [{ ...line, quantity: MAX_LINE_QUANTITY + 1 }] }],
    ['non-uuid product id', { ...valid, lines: [{ ...line, productId: 'abc' }] }],
    ['non-uuid option id', { ...valid, lines: [{ ...line, variantIds: ['x'] }] }],
    ['unknown line kind', { ...valid, lines: [{ kind: 'gift', quantity: 1 }] }],
    ['unknown order type', { ...valid, orderType: 'TELEPORT' }],
    ['non-uuid zone', { ...valid, zoneId: 'downtown' }],
    ['long note', { ...valid, lines: [{ ...line, note: 'x'.repeat(201) }] }],
    ['long coupon', { ...valid, couponCode: 'x'.repeat(41) }],
    ['too many lines', { ...valid, lines: Array.from({ length: MAX_CART_LINES + 1 }, () => line) }],
    [
      'a price sent by the client is not a field, but missing lines is invalid',
      { orderType: 'PICKUP' },
    ],
  ])('rejects %s', (_name, body) => {
    expect(quoteRequestSchema.safeParse(body).success).toBe(false);
  });

  it('ignores prices the client tries to send', () => {
    const parsed = quoteRequestSchema.parse({
      ...valid,
      lines: [{ ...line, unitPrice: 1, price: 1 }],
      grandTotal: 0,
    });
    expect(JSON.stringify(parsed)).not.toContain('unitPrice');
    expect(JSON.stringify(parsed)).not.toContain('grandTotal');
  });
});
