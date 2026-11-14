import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { formatAmount } from '@/shared/utils/format-amount';
import { formatKarachi } from '@/shared/utils/format-time';
import { pageCount, summarizeItems } from '../logic/order-summary';
import type { OrderHistoryPage } from '../types/account.types';

/** The customer's past orders, newest first, each linking to its live tracking page. */
export async function OrderHistory({ history }: { history: OrderHistoryPage }) {
  const t = await getTranslations('account.orders');
  const status = await getTranslations('tracking.status');
  const type = await getTranslations('tracking.type');
  const pages = pageCount(history.total, history.pageSize);

  if (history.total === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-6">
        <p className="text-stone-300">{t('empty')}</p>
        <Link href="/menu" className="text-gold underline">
          {t('browse')}
        </Link>
      </div>
    );
  }

  return (
    <>
      <p role="status" className="mb-4 text-sm text-stone-400">
        {t('count', { count: history.total })}
      </p>
      <ul className="flex flex-col gap-3">
        {history.rows.map((order) => {
          const { shown, more } = summarizeItems(order.items);
          return (
            <li
              key={order.id}
              className="bg-ash flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <div>
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-stone-400">
                  {formatKarachi(order.createdAt)} · {type(order.type)}
                </p>
                <p className="mt-1 text-sm text-stone-300">
                  {shown.join(', ')}
                  {more > 0 ? ` ${t('more', { count: more })}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-right">
                <p className="font-semibold">{formatAmount(order.grandTotal)}</p>
                <p className="text-sm text-stone-300">{status(order.status)}</p>
                <Link
                  href={`/track/${order.trackingToken}`}
                  aria-label={t('trackLabel', { number: order.orderNumber })}
                  className="text-gold text-sm underline"
                >
                  {t('track')}
                </Link>
                <a
                  href={`/api/v1/orders/${order.trackingToken}/receipt?download=1`}
                  download
                  aria-label={t('receiptLabel', { number: order.orderNumber })}
                  className="text-gold text-sm underline"
                >
                  {t('receipt')}
                </a>
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 ? (
        <nav aria-label={t('pages')} className="mt-6 flex items-center justify-between">
          {history.page > 1 ? (
            <Link
              className="text-gold underline"
              href={`/account/orders?page=${String(history.page - 1)}`}
            >
              {t('previous')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-stone-400">
            {t('pageOf', { page: history.page, pages })}
          </span>
          {history.page < pages ? (
            <Link
              className="text-gold underline"
              href={`/account/orders?page=${String(history.page + 1)}`}
            >
              {t('next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
