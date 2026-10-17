import { siteConfig } from '@/lib/site';
import type { DealSummary, ProductDetail } from '@/features/menu/types/menu.types';

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function restaurantSchema(baseUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: siteConfig.name,
    url: baseUrl,
    servesCuisine: 'Barbecue',
    priceRange: 'Rs.',
    address: {
      '@type': 'PostalAddress',
      streetAddress: siteConfig.address.street,
      addressLocality: siteConfig.address.city,
      addressCountry: siteConfig.address.country,
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [...DAYS],
        opens: siteConfig.hours.opens,
        closes: siteConfig.hours.closes,
      },
    ],
  };
}

export function productSchema(product: ProductDetail, baseUrl: string): Record<string, unknown> {
  const url = `${baseUrl}/menu/${product.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url,
    ...(product.description ? { description: product.description } : {}),
    ...(product.images[0] ? { image: product.images.map((image) => image.url) } : {}),
    category: product.categoryName,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'PKR',
      price: product.price.toFixed(2),
      availability: product.orderable
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };
}

export function dealSchema(deal: DealSummary, baseUrl: string): Record<string, unknown> {
  const url = `${baseUrl}/deals/${deal.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: deal.name,
    url,
    ...(deal.description ? { description: deal.description } : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'PKR',
      price: deal.price.toFixed(2),
      availability: 'https://schema.org/InStock',
      ...(deal.endsAt ? { priceValidUntil: deal.endsAt } : {}),
    },
  };
}
