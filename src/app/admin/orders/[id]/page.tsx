import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { adminOrders } from '@/features/admin/server';
import { formatAmount } from '@/features/admin/utils/format-amount';
import { formatKarachi } from '@/features/admin/utils/format-time';

export const metadata = { title: 'Admin order' };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const [t, status, order] = await Promise.all([
    getTranslations('admin.orders'),
    getTranslations('admin.orders.status'),
    adminOrders.get(id.data),
  ]);
  if (!order) notFound();

  const totals: [string, number][] = [
    [t('subtotal'), order.subtotal],
    ...(order.couponDiscount > 0
      ? [[t('discount'), -order.couponDiscount] as [string, number]]
      : []),
    ...(order.deliveryCharge > 0
      ? [[t('delivery'), order.deliveryCharge] as [string, number]]
      : []),
    ...(order.taxAmount > 0 ? [[t('tax'), order.taxAmount] as [string, number]] : []),
  ];

  return (
    <>
      <PageTitle
        title={order.orderNumber}
        hint={`${t(`type.${order.type}`)} · ${formatKarachi(order.createdAt)}`}
      />
      <p className="mb-4">
        <Link href="/admin/orders" className="text-ember underline">
          {t('back')}
        </Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="customer" className="bg-ash rounded-xl p-5 ring-1 ring-stone-800">
          <h3 id="customer" className="mb-3 font-semibold">
            {t('customer')}
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-stone-400">{t('name')}</dt>
            <dd>{order.customerName}</dd>
            <dt className="text-stone-400">{t('phone')}</dt>
            <dd>{order.phone || '-'}</dd>
            {order.email ? (
              <>
                <dt className="text-stone-400">{t('email')}</dt>
                <dd>{order.email}</dd>
              </>
            ) : null}
            {order.address ? (
              <>
                <dt className="text-stone-400">{t('address')}</dt>
                <dd>
                  {[order.address.line1, order.address.line2, order.address.area]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </>
            ) : null}
            {order.instructions ? (
              <>
                <dt className="text-stone-400">{t('instructions')}</dt>
                <dd>{order.instructions}</dd>
              </>
            ) : null}
          </dl>
        </section>

        <section aria-labelledby="payment" className="bg-ash rounded-xl p-5 ring-1 ring-stone-800">
          <h3 id="payment" className="mb-3 font-semibold">
            {t('paymentTitle')}
          </h3>
          <p className="text-sm">
            {t(`method.${order.paymentMethod}`)} · {t(`payment.${order.paymentStatus}`)}
          </p>
          <p className="mt-2 text-sm text-stone-300">
            {t('currentStatus')}: <strong>{status(order.status)}</strong>
          </p>
          <p className="mt-3">
            <Link href="/store/orders" className="text-ember text-sm underline">
              {t('openStorePanel')}
            </Link>
          </p>
        </section>

        <section
          aria-labelledby="items"
          className="bg-ash rounded-xl p-5 ring-1 ring-stone-800 lg:col-span-2"
        >
          <h3 id="items" className="mb-3 font-semibold">
            {t('items')}
          </h3>
          <ul className="flex flex-col gap-3">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${String(index)}`} className="flex justify-between gap-4">
                <div>
                  <p>
                    {item.quantity} × {item.name}
                  </p>
                  {item.options.length > 0 ? (
                    <p className="text-sm text-stone-400">{item.options.join(', ')}</p>
                  ) : null}
                  {item.note ? (
                    <p className="text-sm text-stone-400">
                      {t('note')}: {item.note}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm text-stone-300">
                  {formatAmount(item.unitPrice * item.quantity)}
                </p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex flex-col gap-1 border-t border-stone-700 pt-3 text-sm">
            {totals.map(([label, amount]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-stone-400">{label}</dt>
                <dd>{amount < 0 ? `-${formatAmount(-amount)}` : formatAmount(amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between text-base font-semibold">
              <dt>{t('total')}</dt>
              <dd>{formatAmount(order.grandTotal)}</dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="history"
          className="bg-ash rounded-xl p-5 ring-1 ring-stone-800 lg:col-span-2"
        >
          <h3 id="history" className="mb-3 font-semibold">
            {t('history')}
          </h3>
          <ol className="flex flex-col gap-2 text-sm">
            {order.history.map((entry) => (
              <li key={`${entry.status}-${entry.at}`}>
                <strong>{status(entry.status)}</strong> · {formatKarachi(entry.at)}
                {entry.by ? ` · ${t('by', { who: entry.by })}` : ` · ${t('byCustomer')}`}
                {entry.note ? <span className="text-stone-400"> · “{entry.note}”</span> : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
