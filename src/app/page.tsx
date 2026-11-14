import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DealCard } from '@/features/deals/components/DealCard';
import { ProductCard } from '@/features/menu/components/ProductCard';
import { getDeals, getMenu } from '@/features/menu/server';
import { siteConfig, siteUrl } from '@/lib/site';
import { BrandMark, SectionTitle } from '@/shared/components/brand/BrandMark';
import { JsonLd } from '@/shared/components/seo/JsonLd';
import { restaurantSchema } from '@/shared/seo/structured-data';

// Deals have the shortest freshness window, so the landing page follows it.
export const revalidate = 300;

const button =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

export default async function HomePage() {
  const [menu, deals, t] = await Promise.all([getMenu(), getDeals(), getTranslations('home')]);

  const popular = menu
    .flatMap((category) => category.products)
    .filter((product) => product.isPopular || product.isFeatured)
    .slice(0, 6);

  return (
    <main>
      <JsonLd data={restaurantSchema(siteUrl())} />

      {/* Like the shop's signboard: the name on a red brush stroke over the flames. */}
      <section className="flame-glow relative overflow-hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 pt-12 pb-20 sm:pt-16 sm:pb-28">
          <p
            lang="ur"
            dir="rtl"
            className="brush-stroke font-display -rotate-2 px-4 pt-2 pb-1.5 text-xl text-white sm:text-2xl"
          >
            {t('taglineUrdu')}
          </p>
          <BrandMark size="lg" decorative />
          <h1 className="font-display text-gold sign-shadow max-w-3xl text-4xl tracking-wide sm:text-6xl">
            {t('heroTitle')}
          </h1>
          <p className="max-w-xl text-lg text-stone-200">{t('heroSubtitle')}</p>
          <p lang="ur" dir="rtl" className="font-display text-2xl text-stone-100">
            {t('spicesUrdu')} <span className="text-gold">{t('authenticUrdu')}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/menu"
              className={`${button} bg-ember hover:bg-ember-deep text-white shadow-lg shadow-black/40`}
            >
              {t('orderNow')}
            </Link>
            <Link
              href="/deals"
              className={`${button} bg-char/70 text-gold ring-gold/60 hover:bg-char ring-1`}
            >
              {t('viewDeals')}
            </Link>
          </div>
        </div>
        {/* Fades the flames into the page instead of ending in a hard line. */}
        <div
          aria-hidden="true"
          className="to-char pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-b from-transparent"
        />
      </section>

      {deals.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-8">
          <SectionTitle>{t('dealsTitle')}</SectionTitle>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deals.slice(0, 3).map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </ul>
        </section>
      ) : null}

      {popular.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-8">
          <SectionTitle>{t('popularTitle')}</SectionTitle>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {popular.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>
        </section>
      ) : null}

      {menu.length > 0 ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-8">
          <SectionTitle>{t('categoriesTitle')}</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {menu.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/menu#category-${category.slug}`}
                  className="from-ember to-ember-deep ring-gold/30 hover:ring-gold focus-visible:outline-gold inline-flex min-h-11 items-center rounded-md bg-linear-to-b px-4 text-sm font-semibold text-white shadow-md ring-1 shadow-black/40 focus-visible:outline-2"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/menu"
                className="text-gold inline-flex min-h-11 items-center px-2 text-sm font-medium underline"
              >
                {t('seeAll')}
              </Link>
            </li>
          </ul>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-6xl px-4 py-8">
        <SectionTitle>{t('visitTitle')}</SectionTitle>
        <address className="text-stone-300 not-italic">
          {siteConfig.address.street}, {siteConfig.address.city}
          <br />
          {t('visitServices')}
        </address>
      </section>
    </main>
  );
}
