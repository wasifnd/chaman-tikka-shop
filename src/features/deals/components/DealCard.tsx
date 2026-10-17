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
        className="group bg-ash/60 focus-visible:outline-ember flex flex-col overflow-hidden rounded-xl ring-1 ring-stone-800 transition-colors hover:ring-stone-600 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <FoodImage
          src={deal.imageUrl}
          name={deal.name}
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="text-lg font-semibold group-hover:underline">{deal.name}</h3>
          {deal.description ? (
            <p className="line-clamp-2 text-sm text-stone-400">{deal.description}</p>
          ) : null}
          <p className="mt-auto flex flex-wrap items-baseline gap-2 pt-2">
            <span className="text-lg font-bold">{formatPrice(deal.price)}</span>
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
