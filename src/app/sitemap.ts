import type { MetadataRoute } from 'next';
import { getDeals, getMenu } from '@/features/menu/server';
import { siteUrl } from '@/lib/site';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [menu, deals] = await Promise.all([getMenu(), getDeals()]);
  return [
    { url: base, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/menu`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/deals`, changeFrequency: 'daily', priority: 0.8 },
    ...menu.flatMap((category) =>
      category.products.map((product) => ({
        url: `${base}/menu/${product.slug}`,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
    ),
    ...deals.map((deal) => ({
      url: `${base}/deals/${deal.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
  ];
}
