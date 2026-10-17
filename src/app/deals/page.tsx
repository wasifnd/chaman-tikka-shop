import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DealCard } from '@/features/deals/components/DealCard';
import { getDeals } from '@/features/menu/server';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Deals',
  description: 'Bundles and deals from BBQ Store that cost less than ordering item by item.',
  alternates: { canonical: '/deals' },
};

export default async function DealsPage() {
  const [deals, t] = await Promise.all([getDeals(), getTranslations('deals')]);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-1 mb-6 text-stone-400">{t('subtitle')}</p>
      {deals.length === 0 ? (
        <p className="text-stone-300">{t('empty')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </ul>
      )}
    </main>
  );
}
