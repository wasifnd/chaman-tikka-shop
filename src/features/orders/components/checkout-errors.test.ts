import { describe, expect, it } from 'vitest';
import { classifyFailure } from './checkout-errors';

const error = (code: string, details?: Record<string, string>) => ({
  code,
  message: `server says ${code}`,
  ...(details ? { details } : {}),
});

describe('classifyFailure', () => {
  it('recognises a cart that needs attention', () => {
    expect(classifyFailure(error('CART_INVALID', { RESTAURANT_CLOSED: 'x' }))).toEqual({
      kind: 'cart',
    });
  });

  it('reports the new total when the price changed', () => {
    expect(classifyFailure(error('PRICE_CHANGED', { total: '1560' }))).toEqual({
      kind: 'price',
      total: '1560',
    });
    expect(classifyFailure(error('PRICE_CHANGED'))).toEqual({ kind: 'price', total: null });
  });

  it('recognises coupon, rate limit and in-progress failures', () => {
    expect(classifyFailure(error('COUPON_EXHAUSTED'))).toEqual({ kind: 'coupon' });
    expect(classifyFailure(error('RATE_LIMITED'))).toEqual({ kind: 'busy' });
    expect(classifyFailure(error('ORDER_IN_PROGRESS'))).toEqual({ kind: 'inProgress' });
  });

  it('maps server field paths to form fields and drops paths it does not show', () => {
    expect(
      classifyFailure(
        error('VALIDATION_ERROR', {
          'contact.phone': 'Enter a valid mobile number',
          'address.line1': 'Enter your street address',
          'lines.0.quantity': 'Too big',
        }),
      ),
    ).toEqual({
      kind: 'fields',
      fields: [
        { field: 'phone', message: 'Enter a valid mobile number' },
        { field: 'addressLine1', message: 'Enter your street address' },
      ],
    });
  });

  it('falls back to the server message when no field can be shown', () => {
    expect(classifyFailure(error('VALIDATION_ERROR', { 'lines.0.quantity': 'Too big' }))).toEqual({
      kind: 'other',
      message: 'server says VALIDATION_ERROR',
    });
    expect(classifyFailure(error('VALIDATION_ERROR'))).toMatchObject({ kind: 'other' });
  });

  it.each(['INTERNAL_ERROR', 'NETWORK_ERROR', 'IDEMPOTENCY_CONFLICT', 'WHATEVER'])(
    'treats %s as a general failure',
    (code) => {
      expect(classifyFailure(error(code))).toEqual({
        kind: 'other',
        message: `server says ${code}`,
      });
    },
  );
});
