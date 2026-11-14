import { getTranslations } from 'next-intl/server';
import { formatPrice } from '@/shared/utils/format';
import { formatKarachi } from '@/shared/utils/format-time';
import { cn } from '@/shared/utils/cn';
import type { KhataEntryView } from '../types/khata.types';

interface KhataEntriesProps {
  entries: KhataEntryView[];
  /** Staff see who made each entry and open receipts by order id; customers by tracking link. */
  audience: 'staff' | 'customer';
}

/** Where an entry's receipt opens, if it has one: the order's, or the payment's own. */
function receiptHref(entry: KhataEntryView, audience: KhataEntriesProps['audience']) {
  if (entry.order) {
    return audience === 'staff'
      ? `/api/v1/store/orders/${entry.order.id}/receipt`
      : `/api/v1/orders/${entry.order.trackingToken}/receipt`;
  }
  return entry.kind === 'PAYMENT' ? `/api/v1/khata/entries/${entry.id}/receipt` : null;
}

const amountClass = (amount: number) =>
  cn('font-semibold tabular-nums', amount < 0 ? 'text-green-400' : 'text-gold');

/** "+Rs. 280" or "−Rs. 80". */
const signed = (amount: number) => `${amount < 0 ? '−' : '+'}${formatPrice(Math.abs(amount))}`;

/**
 * Every entry in a khata, newest first, with its receipt. A table on wider screens; stacked cards
 * on a phone, where five columns don't fit.
 */
export async function KhataEntries({ entries, audience }: KhataEntriesProps) {
  const t = await getTranslations('khata');
  if (entries.length === 0) return <p className="text-stone-400">{t('noEntries')}</p>;

  const what = (entry: KhataEntryView) => (
    <>
      <span className="font-medium">{t(`kind.${entry.kind}`)}</span>
      {entry.order ? <span className="whitespace-nowrap"> {entry.order.orderNumber}</span> : null}
      {entry.note && entry.kind !== 'ORDER' ? (
        <span className="block text-xs text-stone-400">{entry.note}</span>
      ) : null}
    </>
  );
  const receipt = (entry: KhataEntryView) => {
    const href = receiptHref(entry, audience);
    return href ? (
      <a href={href} target="_blank" rel="noopener" className="text-gold text-xs underline">
        {t('receipt')}
      </a>
    ) : null;
  };

  return (
    <>
      <ul className="flex flex-col divide-y divide-stone-800 sm:hidden" aria-label={t('history')}>
        {entries.map((entry) => (
          <li key={entry.id} className="flex justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p>{what(entry)}</p>
              <p className="text-xs text-stone-400">
                {formatKarachi(entry.createdAt)}
                {audience === 'staff' && entry.by ? ` · ${t('byName', { name: entry.by })}` : ''}
              </p>
              {receipt(entry)}
            </div>
            <div className="shrink-0 text-right">
              <p className={amountClass(entry.amount)}>{signed(entry.amount)}</p>
              <p className="text-xs text-stone-400 tabular-nums">
                {t('balanceShort', { amount: formatPrice(entry.balanceAfter) })}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('history')}</caption>
          <thead className="text-stone-400">
            <tr>
              <th scope="col" className="py-2 pr-3">
                {t('date')}
              </th>
              <th scope="col" className="py-2 pr-3">
                {t('what')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right">
                {t('amount')}
              </th>
              <th scope="col" className="py-2 pr-3 text-right">
                {t('balanceAfter')}
              </th>
              {audience === 'staff' ? (
                <th scope="col" className="py-2">
                  {t('by')}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="py-2 pr-3 whitespace-nowrap">{formatKarachi(entry.createdAt)}</td>
                <td className="py-2 pr-3">
                  {what(entry)}
                  <span className="block">{receipt(entry)}</span>
                </td>
                <td className={cn('py-2 pr-3 text-right', amountClass(entry.amount))}>
                  {signed(entry.amount)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatPrice(entry.balanceAfter)}
                </td>
                {audience === 'staff' ? <td className="py-2 text-stone-400">{entry.by}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
