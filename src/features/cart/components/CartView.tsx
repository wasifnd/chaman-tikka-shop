'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo } from 'react';
import type { ZoneOption } from '@/features/checkout/types/zone.types';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { useQuote } from '../hooks/useQuote';
import { toQuoteRequest } from '../store/cart.logic';
import { useCartHydrated } from '../store/useCartHydrated';
import { useCartStore } from '../store/useCartStore';
import { CartLineRow } from './CartLineRow';
import { CartSummary } from './CartSummary';
import { CouponBox } from './CouponBox';
import { OrderOptions } from './OrderOptions';

export function CartView({ zones }: { zones: ZoneOption[] }) {
  const t = useTranslations('cart');
  const hydrated = useCartHydrated();
  const items = useCartStore((state) => state.items);
  const orderType = useCartStore((state) => state.orderType);
  const zoneId = useCartStore((state) => state.zoneId);
  const couponCode = useCartStore((state) => state.couponCode);
  const { setQuantity, remove, setOrderType, setZone, setCoupon } = useCartStore.getState();

  const request = useMemo(
    () => toQuoteRequest({ items, orderType, zoneId, couponCode }),
    [items, orderType, zoneId, couponCode],
  );
  const quote = useQuote(request, hydrated && items.length > 0);

  if (!hydrated) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-8">
        <p className="text-lg font-semibold">{t('empty')}</p>
        <p className="text-stone-400">{t('emptyHint')}</p>
        <Link
          href="/menu"
          className="bg-ember focus-visible:outline-ember inline-flex min-h-11 items-center rounded-lg px-4 font-semibold text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t('browseMenu')}
        </Link>
      </div>
    );
  }

  // Per-line details are only trustworthy when the server answered for exactly this cart.
  // While a newer answer is loading, `data` is the previous cart's quote.
  const isCurrent = quote.data !== undefined && !quote.isPlaceholderData;
  const current = isCurrent ? quote.data : undefined;
  const generalIssues = (current?.issues ?? []).filter((issue) => issue.lineIndex === undefined);
  // Until a valid area is chosen the delivery charge is unknown, so showing "Free" would mislead.
  const areaProblem = (quote.data?.issues ?? []).some(
    (issue) => issue.code === 'ZONE_REQUIRED' || issue.code === 'ZONE_INVALID',
  );
  const showDelivery = orderType === 'DELIVERY' && zoneId !== null && !areaProblem;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <CartLineRow
            key={item.key}
            item={item}
            serverUnitPrice={
              current?.lines.find((line) => line.lineIndex === index)?.unitPrice ?? null
            }
            problems={(current?.issues ?? [])
              .filter((issue) => issue.lineIndex === index)
              .map((issue) => issue.message)}
            onQuantity={(quantity) => {
              setQuantity(item.key, quantity);
            }}
            onRemove={() => {
              remove(item.key);
            }}
          />
        ))}
      </ul>

      <aside className="bg-ash/60 flex h-fit flex-col gap-6 rounded-xl p-4 ring-1 ring-stone-800">
        <OrderOptions
          orderType={orderType}
          zoneId={zoneId}
          zones={zones}
          onOrderType={setOrderType}
          onZone={setZone}
        />
        <CouponBox
          code={couponCode}
          result={current?.coupon ?? null}
          onApply={setCoupon}
          onRemove={() => {
            setCoupon(null);
          }}
        />

        <div>
          <h2 className="mb-3 font-semibold">{t('summary')}</h2>
          {quote.isError && !quote.data ? (
            <div className="flex flex-col items-start gap-2">
              <Alert>{t('quoteFailed')}</Alert>
              <Button
                variant="secondary"
                onClick={() => {
                  void quote.refetch();
                }}
              >
                {t('retry')}
              </Button>
            </div>
          ) : (
            <CartSummary
              quote={quote.data}
              updating={quote.isFetching}
              showDelivery={showDelivery}
            />
          )}
        </div>

        {generalIssues.map((issue) => (
          <Alert key={issue.code}>
            {issue.message}
            {issue.code === 'RESTAURANT_CLOSED' ? ` ${t('closedHours')}` : ''}
          </Alert>
        ))}
      </aside>
    </div>
  );
}
