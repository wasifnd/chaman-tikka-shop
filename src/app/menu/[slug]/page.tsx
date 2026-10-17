import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/features/menu/components/ProductCard';
import { ProductOptions } from '@/features/menu/components/ProductOptions';
import { getMenu, getProduct } from '@/features/menu/server';
import { siteUrl } from '@/lib/site';
import { JsonLd } from '@/shared/components/seo/JsonLd';
import { FoodImage } from '@/shared/components/ui/FoodImage';
import { productSchema } from '@/shared/seo/structured-data';
import { formatPrice } from '@/shared/utils/format';

export const revalidate = 3600;

// Known products are built ahead of time so the first visitor never waits on a cold database.
// Products added later are rendered on their first visit, then cached like the rest.
export async function generateStaticParams() {
  const menu = await getMenu();
  return menu.flatMap((category) => category.products.map((product) => ({ slug: product.slug })));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return { title: 'Not found' };
  const description =
    product.description ?? `${product.name} from BBQ Store, ${formatPrice(product.price)}.`;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/menu/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      ...(product.images[0] ? { images: [product.images[0].url] } : {}),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, menu, t] = await Promise.all([
    getProduct(slug),
    getMenu(),
    getTranslations('product'),
  ]);
  if (!product) notFound();

  const related =
    menu
      .find((category) => category.slug === product.categorySlug)
      ?.products.filter((p) => p.id !== product.id)
      .slice(0, 4) ?? [];
  const image = product.images[0]?.url ?? product.thumbnailUrl;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <JsonLd data={productSchema(product, siteUrl())} />
      <Link href="/menu" className="text-sm text-stone-400 hover:text-white">
        ← {t('back')}
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <FoodImage
          src={image}
          name={product.name}
          sizes="(min-width: 768px) 50vw, 100vw"
          priority
          className="rounded-xl"
        />
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-stone-400">{product.categoryName}</p>
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="mt-2 flex items-baseline gap-2 text-xl">
              <span className="font-semibold">{formatPrice(product.price)}</span>
              {product.originalPrice ? (
                <s className="text-base text-stone-500">{formatPrice(product.originalPrice)}</s>
              ) : null}
            </p>
          </div>
          {product.description ? <p className="text-stone-300">{product.description}</p> : null}
          <p className="text-sm text-stone-400">
            {t('prepTime', { count: product.preparationTime })}
          </p>
          <ProductOptions product={product} />
        </div>
      </div>

      {related.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-3 text-xl font-bold">
            {t('related', { category: product.categoryName })}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
