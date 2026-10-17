/** Single source of truth for restaurant details used in the footer, SEO and structured data. */
export const siteConfig = {
  name: 'BBQ Store',
  tagline: "Lahore's finest BBQ",
  address: {
    street: '441-2-D1 Township',
    city: 'Lahore',
    country: 'PK',
  },
  /** Open daily; closes after midnight, so close < open. */
  hours: { opens: '18:00', closes: '02:00' },
} as const;

export function siteUrl(source: Record<string, string | undefined> = process.env): string {
  const raw = source['NEXT_PUBLIC_APP_URL'] || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}
