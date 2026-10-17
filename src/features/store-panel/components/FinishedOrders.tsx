'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatPrice } from '@/shared/utils/format';
import { useStaffOrders } from '../hooks/useStoreOrders';

/** Orders finished in the last 12 hours, loaded only when someone asks to see them. */
export function FinishedOrders() {
  const t = useTranslations('store');
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-8 border-t border-stone-800 pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="focus-visible:outline-ember min-h-11 rounded-lg px-3 text-sm text-stone-300 underline hover:text-white focus-visible:outline-2"
      >
        {open ? t('finished.hide') : t('finished.show')}
      </button>
      {open ? <FinishedList /> : null}
    </section>
  );
}

function FinishedList() {
  const t = useTranslations('store');
  const { data, isPending } = useStaffOrders('finished');
  if (isPending) return null;
  const orders = data?.orders ?? [];

  return (
    <div className="mt-3">
      <h2 className="mb-2 font-semibold">{t('finished.title')}</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-stone-400">{t('finished.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {orders.map((order) => (
            <li
              key={order.id}
              className="bg-ash/60 flex flex-wrap justify-between gap-2 rounded-lg px-3 py-2"
            >
              <span>
                <span className="font-semibold">{order.orderNumber}</span> ·{' '}
                {t(`type.${order.type}`)} · {order.customerName}
              </span>
              <span className="text-stone-300">
                {order.status === 'CANCELLED'
                  ? order.cancelReason
                    ? t('cancelled', { reason: order.cancelReason })
                    : t('cancelledNoReason')
                  : formatPrice(order.grandTotal)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
