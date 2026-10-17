import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DealCard } from '@/features/deals/components/DealCard';
import { ProductCard } from '@/features/menu/components/ProductCard';
import { getDeals, getMenu } from '@/features/menu/server';
import { siteConfig, siteUrl } from '@/lib/site';
import { JsonLd } from '@/shared/components/seo/JsonLd';
import { restaurantSchema } from '@/shared/seo/structured-data';

// Deals have the shortest freshness window, so the landing page follows it.
export const revalidate = 300;

const button =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember';

export default async function HomePage() {
  const [menu, deals, t] = await Promise.all([getMenu(), getDeals(), getTranslations('home')]);

  const popular = menu
    .flatMap((category) => category.products)
    .filter((product) => product.isPopular || product.isFeatured)
    .slice(0, 6);

  return (
    <main>
      <JsonLd data={restaurantSchema(siteUrl())} />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16 sm:py-24">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          {t('heroTitle')}
        </h1>
        <p className="max-w-xl text-lg text-stone-300">{t('heroSubtitle')}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/menu" className={`${button} bg-ember text-white hover:bg-orange-600`}>
            {t('orderNow')}
          </Link>
          <Link
            href="/deals"
            className={`${button} bg-ash text-stone-100 ring-1 ring-stone-700 hover:bg-stone-800`}
          >
            {t('viewDeals')}
          </Link>
        </div>
      </section>

      {deals.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-8">
          <h2 className="mb-3 text-2xl font-bold">{t('dealsTitle')}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deals.slice(0, 3).map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </ul>
        </section>
      ) : null}

      {popular.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-8">
          <h2 className="mb-3 text-2xl font-bold">{t('popularTitle')}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {popular.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>
        </section>
      ) : null}

      {menu.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-8">
          <h2 className="mb-3 text-2xl font-bold">{t('categoriesTitle')}</h2>
          <ul className="flex flex-wrap gap-2">
            {menu.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/menu#category-${category.slug}`}
                  className="bg-ash focus-visible:outline-ember inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-stone-200 ring-1 ring-stone-700 hover:text-white focus-visible:outline-2"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/menu"
                className="text-ember inline-flex min-h-11 items-center px-2 text-sm font-medium underline"
              >
                {t('seeAll')}
              </Link>
            </li>
          </ul>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-6xl px-4 py-8">
        <h2 className="mb-3 text-2xl font-bold">{t('visitTitle')}</h2>
        <address className="text-stone-300 not-italic">
          {siteConfig.address.street}, {siteConfig.address.city}
          <br />
          {t('visitServices')}
        </address>
      </section>
    </main>
  );
}
