'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/utils/cn';
import { formatPrice } from '@/shared/utils/format';
import { buildProgress, isFinished } from '../tracking/order-progress';
import { useNow } from '../tracking/useNow';
import { useOrderTracking } from '../tracking/useOrderTracking';
import type { OrderSnapshot } from '../types/snapshot.types';

const timeFormat = new Intl.DateTimeFormat('en-PK', {
  timeStyle: 'short',
  timeZone: 'Asia/Karachi',
});

export function OrderTracker({
  token,
  snapshot,
  justPlaced,
}: {
  token: string;
  snapshot: OrderSnapshot;
  justPlaced: boolean;
}) {
  const t = useTranslations('tracking');
  const tc = useTranslations('cart');
  const state = useOrderTracking(token, snapshot);
  const now = useNow(snapshot.serverTime);

  const progress = buildProgress(snapshot.type, state.status, state.timeline);
  const cancelled = state.status === 'CANCELLED';
  const beforeReady = ['RECEIVED', 'CONFIRMED', 'PREPARING'].includes(state.status);
  const estimate = state.estimatedReadyAt ? new Date(state.estimatedReadyAt) : null;

  return (
    <div className="flex flex-col gap-6">
      {justPlaced ? (
        <p role="status" className="rounded-lg bg-green-950 px-4 py-3 text-green-200">
          {t('placedBanner')}
        </p>
      ) : null}

      <header>
        <p className="text-sm text-stone-400">{t('type.' + snapshot.type)}</p>
        <h1 className="text-3xl font-bold">{t('orderNumber', { number: snapshot.orderNumber })}</h1>
        <p className="mt-2 text-lg font-semibold" aria-live="polite">
          {t(`status.${state.status}`)}
        </p>
        {beforeReady && estimate ? (
          <p className="text-stone-400">
            {estimate.getTime() > now
              ? t('eta', { time: timeFormat.format(estimate) })
              : t('almostReady')}
          </p>
        ) : null}
        {snapshot.areaName ? (
          <p className="text-stone-400">{t('deliveringTo', { area: snapshot.areaName })}</p>
        ) : null}
      </header>

      {cancelled ? (
        <p role="alert" className="rounded-lg bg-red-950 px-4 py-3 text-red-200">
          {t('cancelled')}
        </p>
      ) : null}

      <section aria-label={t('progress')}>
        <ol className="flex flex-col gap-3">
          {progress.map((step) => (
            <li
              key={step.status}
              aria-current={step.state === 'current' ? 'step' : undefined}
              className="flex items-center gap-3"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  step.state === 'done' && 'bg-green-600 text-white',
                  step.state === 'current' && 'bg-ember text-white ring-4 ring-orange-900',
                  step.state === 'upcoming' && 'bg-stone-800 text-stone-500',
                )}
              >
                {step.state === 'done' ? '✓' : ''}
              </span>
              <span className={cn(step.state === 'upcoming' && 'text-stone-500')}>
                {t(`status.${step.status}`)}
                {step.state === 'current' ? (
                  <span className="sr-only"> ({t('stepCurrent')})</span>
                ) : null}
              </span>
              {step.at ? (
                <span className="ml-auto text-sm text-stone-400">
                  {timeFormat.format(new Date(step.at))}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {state.connection === 'reconnecting' && !isFinished(state.status) ? (
        <p role="status" className="text-sm text-amber-300">
          {t('reconnecting')}
        </p>
      ) : null}
      {state.connection === 'offline' && !isFinished(state.status) ? (
        <p role="status" className="text-sm text-amber-300">
          {t('offline')}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 font-semibold">{t('items')}</h2>
        <ul className="flex flex-col gap-2">
          {snapshot.items.map((item, index) => (
            <li key={`${item.name}-${String(index)}`} className="flex justify-between gap-4">
              <span>
                {item.quantity} × {item.name}
                {item.options.length > 0 ? (
                  <span className="block text-sm text-stone-400">{item.options.join(', ')}</span>
                ) : null}
              </span>
              <span className="whitespace-nowrap">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 flex flex-col gap-1 border-t border-stone-800 pt-3 text-sm">
          <Row label={tc('subtotal')} value={formatPrice(snapshot.subtotal)} />
          {snapshot.couponDiscount > 0 ? (
            <Row label={tc('couponDiscount')} value={`−${formatPrice(snapshot.couponDiscount)}`} />
          ) : null}
          {snapshot.type === 'DELIVERY' ? (
            <Row
              label={tc('deliveryFee')}
              value={
                snapshot.deliveryCharge === 0 ? tc('free') : formatPrice(snapshot.deliveryCharge)
              }
            />
          ) : null}
          {snapshot.taxAmount > 0 ? (
            <Row label={tc('tax')} value={formatPrice(snapshot.taxAmount)} />
          ) : null}
          <div className="flex justify-between border-t border-stone-800 pt-2 text-lg font-bold">
            <dt>{tc('total')}</dt>
            <dd>{formatPrice(snapshot.grandTotal)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-stone-400">
          {snapshot.type === 'DELIVERY' ? t('payCod') : t('payCounter')}
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone-300">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
