import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDeal, getDeals } from '@/features/menu/server';
import { siteUrl } from '@/lib/site';
import { JsonLd } from '@/shared/components/seo/JsonLd';
import { FoodImage } from '@/shared/components/ui/FoodImage';
import { dealSchema } from '@/shared/seo/structured-data';
import { formatPrice, percentOff } from '@/shared/utils/format';

export const revalidate = 300;

// Same approach as products: build known deals ahead of time, cache new ones on first visit.
export async function generateStaticParams() {
  const deals = await getDeals();
  return deals.map((deal) => ({ slug: deal.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const deal = await getDeal((await params).slug);
  if (!deal) return { title: 'Not found' };
  const description = deal.description ?? `${deal.name} for ${formatPrice(deal.price)}.`;
  return {
    title: deal.name,
    description,
    alternates: { canonical: `/deals/${deal.slug}` },
    openGraph: { title: deal.name, description },
  };
}

export default async function DealPage({ params }: Props) {
  const { slug } = await params;
  const [deal, t] = await Promise.all([getDeal(slug), getTranslations('deals')]);
  if (!deal) notFound();

  const percent = percentOff(deal.originalPrice, deal.price);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <JsonLd data={dealSchema(deal, siteUrl())} />
      <Link href="/deals" className="text-sm text-stone-400 hover:text-white">
        ← {t('back')}
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <FoodImage
          src={deal.imageUrl}
          name={deal.name}
          sizes="(min-width: 768px) 50vw, 100vw"
          priority
          className="rounded-xl"
        />
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">{deal.name}</h1>
          {deal.description ? <p className="text-stone-300">{deal.description}</p> : null}
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-bold">{formatPrice(deal.price)}</span>
            {percent > 0 ? (
              <>
                <s className="text-stone-500">{formatPrice(deal.originalPrice)}</s>
                <span className="rounded-full bg-green-900/60 px-2 py-0.5 text-xs font-medium text-green-300">
                  {t('save', { percent })}
                </span>
              </>
            ) : null}
          </p>
          {deal.endsAt ? (
            <p className="text-sm text-stone-400">
              {t('validUntil', {
                date: new Intl.DateTimeFormat('en-PK', {
                  dateStyle: 'medium',
                  timeZone: 'Asia/Karachi',
                }).format(new Date(deal.endsAt)),
              })}
            </p>
          ) : null}
          <section>
            <h2 className="mb-2 font-semibold">{t('includes')}</h2>
            <ul className="flex flex-col gap-1 text-stone-300">
              {deal.items.map((item, index) => (
                <li key={`${item.productName}-${String(index)}`}>
                  {item.quantity} × {item.productName}
                  {item.variantName ? ` (${item.variantName})` : ''}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
