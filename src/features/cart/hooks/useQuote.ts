'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Quote } from '@/features/checkout/types/quote.types';
import { postJson } from '@/shared/utils/api';
import type { toQuoteRequest } from '../store/cart.logic';

type QuoteRequest = ReturnType<typeof toQuoteRequest>;

/** Checks the server's answer has the shape the cart page relies on before using it. */
export function readQuote(data: unknown): Quote {
  const quote = (data as { quote?: Partial<Quote> } | null)?.quote;
  if (
    !quote ||
    !Array.isArray(quote.lines) ||
    !Array.isArray(quote.issues) ||
    typeof quote.grandTotal !== 'number' ||
    typeof quote.canCheckout !== 'boolean'
  ) {
    throw new Error('Unexpected quote response');
  }
  return quote as Quote;
}

export async function fetchQuote(
  request: QuoteRequest,
  fetcher: typeof fetch = fetch,
): Promise<Quote> {
  const result = await postJson('/api/v1/cart/quote', request, fetcher);
  if (!result.ok) throw new Error(result.error.message);
  return readQuote(result.data);
}

/**
 * The authoritative price of the cart, from the server. Re-checked when the tab regains focus
 * because prices, stock and opening hours can change while a cart sits open.
 */
export function useQuote(request: QuoteRequest, enabled: boolean) {
  return useQuery({
    queryKey: ['quote', request],
    queryFn: () => fetchQuote(request),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: 1,
  });
}
