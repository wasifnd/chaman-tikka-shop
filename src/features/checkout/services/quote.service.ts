import type { Quote, QuoteData, QuoteInput } from '../types/quote.types';
import { buildQuote } from './quote-engine';

export type QuoteDataLoader = (input: QuoteInput) => Promise<QuoteData>;

/** Loads trusted data, then prices the cart. The clock is injectable so tests can pick the time. */
export function createQuoteService(load: QuoteDataLoader, now: () => Date = () => new Date()) {
  return {
    async quote(input: QuoteInput): Promise<Quote> {
      const data = await load(input);
      return buildQuote(input, data, now());
    },
  };
}

export type QuoteService = ReturnType<typeof createQuoteService>;
