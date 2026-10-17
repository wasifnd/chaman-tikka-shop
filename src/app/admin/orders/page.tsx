import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { OrderFilters } from '@/features/admin/components/OrderFilters';
import { ordersQuerySchema } from '@/features/admin/schemas/operations.schema';
import { adminOrders } from '@/features/admin/server';
import { formatAmount } from '@/features/admin/utils/format-amount';
import { formatKarachi } from '@/features/admin/utils/format-time';

export const metadata = { title: 'Admin orders' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Keeps the current search while moving between pages. */
function pageHref(params: Record<string, string>, page: number): string {
  const query = new URLSearchParams({ ...params, page: String(page) });
  return `/admin/orders?${query.toString()}`;
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const input = Object.fromEntries(
    ['q', 'status', 'type', 'from', 'to', 'page'].flatMap((key) => {
      const value = first(raw[key]);
      return value ? [[key, value]] : [];
    }),
  );
  // A mangled link falls back to showing everything rather than an error page.
  const parsed = ordersQuerySchema.safeParse(input);
  const query = parsed.success ? parsed.data : ordersQuerySchema.parse({});
  const kept = parsed.success ? input : {};

  const [t, status, result] = await Promise.all([
    getTranslations('admin.orders'),
    getTranslations('admin.orders.status'),
    adminOrders.search(query),
  ]);
  const { page: _page, ...filters } = kept;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <>
      <PageTitle title={t('title')} hint={t('hint')} />
      <OrderFilters values={filters} />

      <p className="my-4 text-sm text-stone-400" role="status">
        {t('count', { count: result.total })}
      </p>
      {result.rows.length === 0 ? <p className="text-stone-400">{t('empty')}</p> : null}

      <ul className="flex flex-col gap-3">
        {result.rows.map((order) => (
          <li key={order.id}>
            <Link
              href={`/admin/orders/${order.id}`}
              className="bg-ash focus-visible:outline-ember flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800 hover:ring-stone-600 focus-visible:outline-2"
            >
              <div>
                <p className="font-semibold">{order.orderNumber}</p>
                <p className="text-sm text-stone-400">
                  {order.customerName}
                  {order.phone ? ` · ${order.phone}` : ''} · {t(`type.${order.type}`)}
                </p>
                <p className="text-xs text-stone-500">{formatKarachi(order.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatAmount(order.grandTotal)}</p>
                <p className="text-sm text-stone-300">{status(order.status)}</p>
                <p className="text-xs text-stone-500">{t(`payment.${order.paymentStatus}`)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {pages > 1 ? (
        <nav aria-label={t('pages')} className="mt-6 flex items-center justify-between">
          {result.page > 1 ? (
            <Link className="text-ember underline" href={pageHref(filters, result.page - 1)}>
              {t('previous')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-stone-400">
            {t('pageOf', { page: result.page, pages })}
          </span>
          {result.page < pages ? (
            <Link className="text-ember underline" href={pageHref(filters, result.page + 1)}>
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
