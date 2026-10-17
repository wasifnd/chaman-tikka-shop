import type { ApiError } from '@/shared/utils/api';

export type CheckoutField =
  'name' | 'phone' | 'email' | 'addressLine1' | 'addressLine2' | 'instructions';

/** Server field paths -> form field names. */
const FIELD_FOR_PATH: Record<string, CheckoutField> = {
  'contact.name': 'name',
  'contact.phone': 'phone',
  'contact.email': 'email',
  'address.line1': 'addressLine1',
  'address.line2': 'addressLine2',
  instructions: 'instructions',
};

export type CheckoutFailure =
  | { kind: 'fields'; fields: { field: CheckoutField; message: string }[] }
  | { kind: 'cart' } // something in the cart needs attention
  | { kind: 'price'; total: string | null }
  | { kind: 'coupon' }
  | { kind: 'busy' } // rate limited
  | { kind: 'inProgress' }
  | { kind: 'other'; message: string };

/** Sorts a failed order response into what the customer should be told and what to do next. */
export function classifyFailure(error: ApiError): CheckoutFailure {
  switch (error.code) {
    case 'CART_INVALID':
      return { kind: 'cart' };
    case 'PRICE_CHANGED':
      return { kind: 'price', total: error.details?.['total'] ?? null };
    case 'COUPON_EXHAUSTED':
      return { kind: 'coupon' };
    case 'RATE_LIMITED':
      return { kind: 'busy' };
    case 'ORDER_IN_PROGRESS':
      return { kind: 'inProgress' };
    case 'VALIDATION_ERROR': {
      const fields = Object.entries(error.details ?? {}).flatMap(([path, message]) => {
        const field = FIELD_FOR_PATH[path];
        return field ? [{ field, message }] : [];
      });
      return fields.length > 0
        ? { kind: 'fields', fields }
        : { kind: 'other', message: error.message };
    }
    default:
      return { kind: 'other', message: error.message };
  }
}
