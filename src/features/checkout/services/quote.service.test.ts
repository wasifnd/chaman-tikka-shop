import { describe, expect, it, vi } from 'vitest';
import { OPEN_NOW, CLOSED_NOW, ids, quoteData } from '../testing/fixtures';
import type { QuoteInput } from '../types/quote.types';
import { createQuoteService } from './quote.service';

const input: QuoteInput = {
  orderType: 'PICKUP',
  lines: [{ kind: 'product', productId: ids.naan, quantity: 2, variantIds: [], addonIds: [] }],
};

describe('createQuoteService', () => {
  it('loads data for the exact input and prices it at the injected time', async () => {
    const load = vi.fn(() => Promise.resolve(quoteData()));
    const service = createQuoteService(load, () => OPEN_NOW);
    const quote = await service.quote(input);
    expect(load).toHaveBeenCalledWith(input);
    expect(quote.subtotal).toBe(60);
    expect(quote.canCheckout).toBe(true);
  });

  it('uses the clock for the opening-hours check', async () => {
    const service = createQuoteService(
      () => Promise.resolve(quoteData()),
      () => CLOSED_NOW,
    );
    expect((await service.quote(input)).issues.map((i) => i.code)).toEqual(['RESTAURANT_CLOSED']);
  });

  it('defaults to the real clock', async () => {
    const service = createQuoteService(() => Promise.resolve(quoteData()));
    const quote = await service.quote(input);
    expect(quote.subtotal).toBe(60); // priced regardless of whether the shop is open right now
  });

  it('lets loader failures surface to the caller', async () => {
    const service = createQuoteService(() => Promise.reject(new Error('db down')));
    await expect(service.quote(input)).rejects.toThrow('db down');
  });
});
