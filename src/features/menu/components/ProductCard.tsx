import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { FoodImage } from '@/shared/components/ui/FoodImage';
import { cn } from '@/shared/utils/cn';
import { formatPrice } from '@/shared/utils/format';
import type { MenuProduct } from '../types/menu.types';

export function ProductCard({
  product,
  priority = false,
}: {
  product: MenuProduct;
  priority?: boolean;
}) {
  const t = useTranslations('menu');

  return (
    <li className="contents">
      <Link
        href={`/menu/${product.slug}`}
        className={cn(
          'group bg-ash/80 ring-ember/40 hover:ring-gold/70 flex flex-col overflow-hidden rounded-xl shadow-lg ring-1 shadow-black/40 transition',
          'focus-visible:outline-gold focus-visible:outline-2 focus-visible:outline-offset-2',
          !product.orderable && 'opacity-70',
        )}
      >
        <FoodImage
          src={product.thumbnailUrl}
          name={product.name}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          priority={priority}
        />
        <div className="flex flex-1 flex-col gap-1 px-3 pb-3">
          {/* The dish name on a red banner over the photo's edge, as on the signboard. */}
          <h3 className="from-ember to-ember-deep ring-gold/30 relative z-10 -mt-4 rounded-md bg-linear-to-b px-2 py-1.5 text-center font-semibold text-white shadow-md ring-1 shadow-black/50 group-hover:underline">
            {product.name}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {product.isPopular ? <Badge tone="ember">{t('popular')}</Badge> : null}
            {!product.orderable ? <Badge tone="muted">{t('soldOut')}</Badge> : null}
            {product.orderable && product.stockStatus === 'LIMITED' ? (
              <Badge tone="muted">{t('limited')}</Badge>
            ) : null}
          </div>
          {product.description ? (
            <p className="line-clamp-2 text-sm text-stone-400">{product.description}</p>
          ) : null}
          <p className="mt-auto flex items-baseline gap-2 pt-2">
            <span className="text-gold font-semibold">{formatPrice(product.price)}</span>
            {product.originalPrice ? (
              <s className="text-sm text-stone-500">{formatPrice(product.originalPrice)}</s>
            ) : null}
          </p>
        </div>
      </Link>
    </li>
  );
}

function Badge({ tone, children }: { tone: 'ember' | 'muted'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'ember' ? 'bg-gold text-char' : 'bg-stone-800 text-stone-300',
      )}
    >
      {children}
    </span>
  );
}
