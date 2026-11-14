import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AnalyticsView } from '@/features/admin/components/analytics/AnalyticsView';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { resolveRange } from '@/features/admin/logic/analytics-range';
import { adminOrders, analytics } from '@/features/admin/server';
import { formatAmount } from '@/shared/utils/format-amount';
import { formatKarachi } from '@/shared/utils/format-time';

export const metadata = { title: 'Admin dashboard' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const now = new Date();
  const range = resolveRange(
    { preset: first(raw['preset']), from: first(raw['from']), to: first(raw['to']) },
    now,
  );

  const [t, stats, report] = await Promise.all([
    getTranslations('admin.dashboard'),
    adminOrders.dashboard(now),
    analytics.report(range),
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
              className="bg-ash focus-visible:outline-gold flex flex-col gap-1 rounded-xl p-5 ring-1 ring-stone-800 hover:ring-stone-600 focus-visible:outline-2"
            >
              <span className="text-sm text-stone-400">{t(card.key)}</span>
              <span className="text-3xl font-bold">{card.value}</span>
            </Link>
          </li>
        ))}
      </ul>
      <AnalyticsView report={report} />
    </>
  );
}
