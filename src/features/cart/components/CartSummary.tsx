import { useTranslations } from 'next-intl';
import type { Quote } from '@/features/checkout/types/quote.types';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { formatPrice } from '@/shared/utils/format';

interface CartSummaryProps {
  quote: Quote | undefined;
  /** True while a newer price is being fetched; the numbers shown may be one step behind. */
  updating: boolean;
  showDelivery: boolean;
}

export function CartSummary({ quote, updating, showDelivery }: CartSummaryProps) {
  const t = useTranslations('cart');

  if (!quote) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
    );
  }

  return (
    <div aria-busy={updating} className={updating ? 'opacity-60' : undefined}>
      <dl className="flex flex-col gap-2 text-sm">
        <Row label={t('subtotal')} value={formatPrice(quote.subtotal)} />
        {quote.couponDiscount > 0 ? (
          <Row
            label={t('couponDiscount')}
            value={`−${formatPrice(quote.couponDiscount)}`}
            tone="good"
          />
        ) : null}
        {showDelivery ? (
          <Row
            label={t('deliveryFee')}
            value={quote.deliveryCharge === 0 ? t('free') : formatPrice(quote.deliveryCharge)}
          />
        ) : null}
        {quote.taxAmount > 0 ? <Row label={t('tax')} value={formatPrice(quote.taxAmount)} /> : null}
        <div className="mt-1 flex items-baseline justify-between border-t border-stone-700 pt-3 text-lg font-bold">
          <dt>{t('total')}</dt>
          <dd>{formatPrice(quote.grandTotal)}</dd>
        </div>
      </dl>
      {showDelivery && quote.freeDeliveryRemaining !== null && quote.freeDeliveryRemaining > 0 ? (
        <p className="mt-3 text-sm text-stone-400">
          {t('freeDeliveryHint', { amount: formatPrice(quote.freeDeliveryRemaining) })}
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {updating ? t('calculating') : ''}
      </p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-stone-300">{label}</dt>
      <dd className={tone === 'good' ? 'text-green-400' : undefined}>{value}</dd>
    </div>
  );
}
