import { getRequestConfig } from 'next-intl/server';

// Locale routing is deliberately not set up yet: release 1 is English only.
// Urdu will be added as a second messages file selected by cookie, without URL prefixes.
export const DEFAULT_LOCALE = 'en';

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  messages: (
    (await import(`./messages/${DEFAULT_LOCALE}.json`)) as { default: Record<string, unknown> }
  ).default,
}));
