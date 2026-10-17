import { describe, expect, it } from 'vitest';
import { checkoutFormSchema } from './checkout-form.schema';

const valid = { name: 'Ali Khan', phone: '0300-123 4567' };

describe('checkoutFormSchema', () => {
  it('accepts pickup details without an address and normalises the phone', () => {
    const parsed = checkoutFormSchema('PICKUP').parse(valid);
    expect(parsed.phone).toBe('03001234567');
    expect(parsed.addressLine1).toBeUndefined();
  });

  it('requires a street address for delivery only', () => {
    expect(checkoutFormSchema('DELIVERY').safeParse(valid).success).toBe(false);
    expect(checkoutFormSchema('DELIVERY').safeParse({ ...valid, addressLine1: 'ab' }).success).toBe(
      false,
    );
    expect(
      checkoutFormSchema('DELIVERY').safeParse({ ...valid, addressLine1: 'House 12, Street 4' })
        .success,
    ).toBe(true);
    expect(checkoutFormSchema('DINE_IN').safeParse(valid).success).toBe(true);
  });

  it('treats blank optional fields as not provided', () => {
    const parsed = checkoutFormSchema('PICKUP').parse({
      ...valid,
      email: '',
      addressLine1: '',
      addressLine2: '  ',
      instructions: '',
    });
    expect(parsed).toMatchObject({
      email: undefined,
      addressLine1: undefined,
      addressLine2: undefined,
      instructions: undefined,
    });
  });

  it('trims and lowercases the email and rejects bad ones', () => {
    expect(checkoutFormSchema('PICKUP').parse({ ...valid, email: ' Ali@Example.COM ' }).email).toBe(
      'ali@example.com',
    );
    expect(checkoutFormSchema('PICKUP').safeParse({ ...valid, email: 'nope' }).success).toBe(false);
  });

  it.each([
    ['short name', { ...valid, name: 'A' }],
    ['bad phone', { ...valid, phone: '12345' }],
    ['very long instructions', { ...valid, instructions: 'x'.repeat(501) }],
    ['very long second line', { ...valid, addressLine2: 'x'.repeat(201) }],
  ])('rejects %s', (_name, body) => {
    expect(checkoutFormSchema('PICKUP').safeParse(body).success).toBe(false);
  });
});
