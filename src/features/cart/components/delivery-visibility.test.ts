import { describe, expect, it } from 'vitest';
import { shouldShowDelivery } from './delivery-visibility';

const issue = (code: 'ZONE_REQUIRED' | 'ZONE_INVALID' | 'RESTAURANT_CLOSED') => ({
  code,
  message: code,
});

describe('shouldShowDelivery', () => {
  it('shows delivery once an area is chosen and accepted', () => {
    expect(shouldShowDelivery('DELIVERY', 'zone-1', { issues: [] })).toBe(true);
    expect(shouldShowDelivery('DELIVERY', 'zone-1', { issues: [issue('RESTAURANT_CLOSED')] })).toBe(
      true,
    );
  });

  it('hides it for pickup and dine-in', () => {
    expect(shouldShowDelivery('PICKUP', 'zone-1', { issues: [] })).toBe(false);
    expect(shouldShowDelivery('DINE_IN', null, { issues: [] })).toBe(false);
  });

  it('hides it until an area is chosen', () => {
    expect(shouldShowDelivery('DELIVERY', null, { issues: [] })).toBe(false);
  });

  it('hides it when the server rejects the area', () => {
    expect(shouldShowDelivery('DELIVERY', 'zone-1', { issues: [issue('ZONE_INVALID')] })).toBe(
      false,
    );
    expect(shouldShowDelivery('DELIVERY', 'zone-1', { issues: [issue('ZONE_REQUIRED')] })).toBe(
      false,
    );
  });

  it('shows it while the first price is still loading', () => {
    expect(shouldShowDelivery('DELIVERY', 'zone-1', undefined)).toBe(true);
  });
});
