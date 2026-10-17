import { describe, expect, it, vi } from 'vitest';
import { fetchQuote, readQuote } from './useQuote';

const goodQuote = {
  lines: [],
  issues: [],
  subtotal: 0,
  grandTotal: 0,
  canCheckout: false,
};
const request = { lines: [], orderType: 'PICKUP' as const, zoneId: null, couponCode: null };

describe('readQuote', () => {
  it('accepts a well-formed quote', () => {
    expect(readQuote({ quote: goodQuote })).toBe(goodQuote);
  });

  it.each([
    ['null', null],
    ['no quote', {}],
    ['lines not an array', { quote: { ...goodQuote, lines: 'x' } }],
    ['issues missing', { quote: { ...goodQuote, issues: undefined } }],
    ['total not a number', { quote: { ...goodQuote, grandTotal: '10' } }],
    ['canCheckout missing', { quote: { ...goodQuote, canCheckout: undefined } }],
  ])('rejects a response with %s', (_name, data) => {
    expect(() => readQuote(data)).toThrow('Unexpected quote response');
  });
});

describe('fetchQuote', () => {
  it('posts the request and returns the quote', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ success: true, data: { quote: goodQuote } })),
    );
    expect(await fetchQuote(request, fetcher)).toEqual(goodQuote);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/cart/quote');
    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(JSON.parse(typeof body === 'string' ? body : '{}')).toEqual(request);
  });

  it('throws the server message when the request fails', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Slow down' } },
          { status: 429 },
        ),
      ),
    );
    await expect(fetchQuote(request, fetcher)).rejects.toThrow('Slow down');
  });

  it('throws on a malformed success response', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ success: true, data: { nope: true } })),
    );
    await expect(fetchQuote(request, fetcher)).rejects.toThrow('Unexpected quote response');
  });
});
