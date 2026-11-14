import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { DealSummary } from '@/features/menu/types/menu.types';
import { FoodImage } from '@/shared/components/ui/FoodImage';
import { formatPrice, percentOff } from '@/shared/utils/format';

export function DealCard({ deal }: { deal: DealSummary }) {
  const t = useTranslations('deals');
  const percent = percentOff(deal.originalPrice, deal.price);

  return (
    <li className="contents">
      <Link
        href={`/deals/${deal.slug}`}
        className="group bg-ash/80 ring-ember/40 hover:ring-gold/70 focus-visible:outline-gold flex flex-col overflow-hidden rounded-xl shadow-lg ring-1 shadow-black/40 transition focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <FoodImage
          src={deal.imageUrl}
          name={deal.name}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        <div className="flex flex-1 flex-col gap-1 px-4 pb-4">
          <h3 className="from-ember to-ember-deep ring-gold/30 relative z-10 -mt-5 rounded-md bg-linear-to-b px-3 py-2 text-center text-lg font-semibold text-white shadow-md ring-1 shadow-black/50 group-hover:underline">
            {deal.name}
          </h3>
          {deal.description ? (
            <p className="line-clamp-2 text-sm text-stone-400">{deal.description}</p>
          ) : null}
          <p className="mt-auto flex flex-wrap items-baseline gap-2 pt-2">
            <span className="text-gold text-lg font-bold">{formatPrice(deal.price)}</span>
            {percent > 0 ? (
              <>
                <s className="text-sm text-stone-500">{formatPrice(deal.originalPrice)}</s>
                <span className="rounded-full bg-green-900/60 px-2 py-0.5 text-xs font-medium text-green-300">
                  {t('save', { percent })}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </Link>
    </li>
  );
}
