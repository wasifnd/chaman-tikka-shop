import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { adminOrders } from '@/features/admin/server';
import { formatAmount } from '@/features/admin/utils/format-amount';
import { formatKarachi } from '@/features/admin/utils/format-time';

export const metadata = { title: 'Admin dashboard' };

export default async function AdminDashboardPage() {
  const [t, stats] = await Promise.all([
    getTranslations('admin.dashboard'),
    adminOrders.dashboard(new Date()),
  ]);

  const cards = [
    { key: 'ordersToday', value: String(stats.ordersToday), href: '/admin/orders' },
    { key: 'revenueToday', value: formatAmount(stats.revenueToday), href: '/admin/orders' },
    { key: 'activeOrders', value: String(stats.activeOrders), href: '/store/orders' },
    {
      key: 'cancelledToday',
      value: String(stats.cancelledToday),
      href: '/admin/orders?status=CANCELLED',
    },
    { key: 'unavailableProducts', value: String(stats.unavailableProducts), href: '/admin/menu' },
  ] as const;

  return (
    <>
      <PageTitle title={t('title')} hint={t('since', { time: formatKarachi(stats.since) })} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.key}>
            <Link
              href={card.href}
              className="bg-ash focus-visible:outline-ember flex flex-col gap-1 rounded-xl p-5 ring-1 ring-stone-800 hover:ring-stone-600 focus-visible:outline-2"
            >
              <span className="text-sm text-stone-400">{t(card.key)}</span>
              <span className="text-3xl font-bold">{card.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
