import { getTranslations } from 'next-intl/server';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { formatAmount } from '@/shared/utils/format-amount';
import Link from 'next/link';
import { percentChange } from '../../logic/analytics';
import { PRESETS } from '../../logic/analytics-range';
import { describeChange, formatDay, formatHour } from '../../logic/chart-math';
import type { AnalyticsReport } from '../../services/analytics.repository';
import { BarList, ColumnChart } from './charts';

const count = (value: number) => value.toLocaleString('en-PK');

/** Sales, trends and best sellers for the chosen dates, with a spreadsheet download for each. */
export async function AnalyticsView({ report }: { report: AnalyticsReport }) {
  const t = await getTranslations('admin.analytics');
  const type = await getTranslations('tracking.type');
  const { range, current, previous } = report;
  const { summary } = current;
  const empty = summary.orders === 0 && summary.cancelled === 0;
  const query = new URLSearchParams(
    range.preset === 'custom'
      ? { preset: 'custom', from: range.from, to: range.to }
      : { preset: range.preset },
  ).toString();

  const change = (now: number, before: number) => {
    const c = describeChange(percentChange(now, before));
    switch (c.kind) {
      case 'up':
        return t('change.up', { percent: c.percent });
      case 'down':
        return t('change.down', { percent: c.percent });
      case 'flat':
        return t('change.flat');
      default:
        return t('change.none');
    }
  };

  const cards = [
    {
      key: 'orders',
      value: count(summary.orders),
      note: change(summary.orders, previous.summary.orders),
    },
    {
      key: 'sales',
      value: formatAmount(summary.revenue),
      note: change(summary.revenue, previous.summary.revenue),
    },
    {
      key: 'average',
      value: formatAmount(summary.averageOrder),
      note: change(summary.averageOrder, previous.summary.averageOrder),
    },
    {
      key: 'cancelled',
      value: count(summary.cancelled),
      note: t('cancelRate', { percent: Math.round(summary.cancelRate * 100) }),
    },
    { key: 'itemsSold', value: count(summary.itemsSold), note: null },
    { key: 'discounts', value: formatAmount(summary.discounts), note: null },
  ] as const;

  return (
    <section aria-labelledby="analytics-title" className="mt-10 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="analytics-title" className="text-xl font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-stone-400">
          {t('showing', { from: formatDay(range.from), to: formatDay(range.to) })} · {t('dayNote')}
        </p>
      </div>

      <nav aria-label={t('rangeLabel')} className="flex flex-wrap items-end gap-2">
        {PRESETS.map((preset) => (
          <Link
            key={preset}
            href={`/admin?preset=${preset}`}
            aria-current={range.preset === preset ? 'page' : undefined}
            className={`focus-visible:outline-ember inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium focus-visible:outline-2 ${
              range.preset === preset
                ? 'bg-ember text-white'
                : 'bg-ash text-stone-300 ring-1 ring-stone-700 hover:text-white'
            }`}
          >
            {t(`presets.${preset}`)}
          </Link>
        ))}
        <form method="get" action="/admin" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="preset" value="custom" />
          <Input label={t('from')} name="from" type="date" defaultValue={range.from} />
          <Input label={t('to')} name="to" type="date" defaultValue={range.to} />
          <Button type="submit" variant={range.preset === 'custom' ? 'primary' : 'secondary'}>
            {t('show')}
          </Button>
        </form>
      </nav>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li
            key={card.key}
            className="bg-ash flex flex-col gap-1 rounded-xl p-5 ring-1 ring-stone-800"
          >
            <span className="text-sm text-stone-400">{t(`cards.${card.key}`)}</span>
            <span className="text-3xl font-bold">{card.value}</span>
            {card.note ? <span className="text-sm text-stone-400">{card.note}</span> : null}
          </li>
        ))}
      </ul>

      {empty ? (
        <p className="text-stone-400">{t('empty')}</p>
      ) : (
        <div className="grid gap-6 *:min-w-0 lg:grid-cols-2">
          <div className="bg-ash rounded-xl p-5 ring-1 ring-stone-800 lg:col-span-2">
            <h3 className="mb-3 font-semibold">{t('daily')}</h3>
            <ColumnChart
              title={t('daily')}
              tableLabel={t('viewTable')}
              labelHeader={t('day')}
              valueHeader={t('sales')}
              format={formatAmount}
              data={current.daily.map((d) => ({
                label: formatDay(d.day),
                value: d.revenue,
                detail: t('dailyDetail', {
                  day: formatDay(d.day),
                  sales: formatAmount(d.revenue),
                  orders: d.orders,
                }),
              }))}
            />
          </div>

          <div className="bg-ash rounded-xl p-5 ring-1 ring-stone-800 lg:col-span-2">
            <h3 className="mb-1 font-semibold">{t('hours')}</h3>
            <p className="mb-3 text-sm text-stone-400">{t('hoursHint')}</p>
            <ColumnChart
              title={t('hours')}
              tableLabel={t('viewTable')}
              labelHeader={t('hour')}
              valueHeader={t('cards.orders')}
              format={count}
              data={current.hours.map((h) => ({
                label: formatHour(h.hour),
                value: h.orders,
                detail: t('hourDetail', { hour: formatHour(h.hour), orders: h.orders }),
              }))}
            />
          </div>

          <div className="bg-ash rounded-xl p-5 ring-1 ring-stone-800">
            <h3 className="mb-3 font-semibold">{t('byType')}</h3>
            <BarList
              format={count}
              items={current.byType.map((entry) => ({
                label: type(entry.type),
                value: entry.orders,
                detail: formatAmount(entry.revenue),
              }))}
            />
            <p className="mt-4 text-sm text-stone-400">
              {t('customers', { signedIn: summary.registeredOrders, guests: summary.guestOrders })}
            </p>
          </div>

          <div className="bg-ash rounded-xl p-5 ring-1 ring-stone-800">
            <h3 className="mb-3 font-semibold">{t('products')}</h3>
            {current.topProducts.length === 0 ? (
              <p className="text-sm text-stone-400">{t('empty')}</p>
            ) : (
              <BarList
                format={(value) => t('sold', { count: value })}
                items={current.topProducts.map((product) => ({
                  label: product.name,
                  value: product.quantity,
                  detail: formatAmount(product.revenue),
                }))}
              />
            )}
          </div>

          <div className="bg-ash rounded-xl p-5 ring-1 ring-stone-800 lg:col-span-2">
            <h3 className="mb-3 font-semibold">{t('money')}</h3>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-stone-400">{t('deliveryFees')}</dt>
                <dd className="text-lg font-semibold">{formatAmount(summary.deliveryFees)}</dd>
              </div>
              <div>
                <dt className="text-stone-400">{t('tax')}</dt>
                <dd className="text-lg font-semibold">{formatAmount(summary.tax)}</dd>
              </div>
              <div>
                <dt className="text-stone-400">{t('discounts')}</dt>
                <dd className="text-lg font-semibold">{formatAmount(summary.discounts)}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('export')}</h3>
        <p className="text-sm text-stone-400">{t('exportHint')}</p>
        <ul className="flex flex-wrap gap-2">
          {(['orders', 'products', 'daily'] as const).map((kind) => (
            <li key={kind}>
              <a
                href={`/api/v1/admin/analytics/export?kind=${kind}&${query}`}
                className="bg-ash focus-visible:outline-ember inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-stone-100 ring-1 ring-stone-700 hover:bg-stone-800 focus-visible:outline-2"
              >
                {t(`exports.${kind}`)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
