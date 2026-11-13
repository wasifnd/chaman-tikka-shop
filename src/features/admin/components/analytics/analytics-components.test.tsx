// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';
import { buildAnalytics, type AnalyticsOrder } from '../../logic/analytics';
import { previousRange, resolveRange } from '../../logic/analytics-range';
import type { AnalyticsReport } from '../../services/analytics.repository';
import { AnalyticsView } from './AnalyticsView';
import { BarList, ColumnChart } from './charts';

// The page asks the server for its translator; give it the real messages.
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) =>
    Promise.resolve(createTranslator({ locale: 'en', messages, namespace: namespace as 'admin' })),
}));

afterEach(cleanup);

const money = (value: number) => `Rs. ${String(value)}`;

describe('ColumnChart', () => {
  const data = [
    { label: '1 Oct', value: 100, detail: '1 Oct: Rs. 100' },
    { label: '2 Oct', value: 0, detail: '2 Oct: nothing' },
    { label: '3 Oct', value: 400, detail: '3 Oct: Rs. 400' },
  ];
  const show = (rows = data) =>
    render(
      <ColumnChart
        data={rows}
        title="Sales each day"
        tableLabel="View as a table"
        labelHeader="Day"
        valueHeader="Sales"
        format={money}
      />,
    );

  it('is a labelled picture with a column for each day that had sales', () => {
    const { container } = show();
    expect(screen.getByRole('img', { name: 'Sales each day' })).toBeInTheDocument();
    // A day with nothing draws no column but is still on the axis and in the table.
    expect(container.querySelectorAll('svg path')).toHaveLength(2);
    expect(screen.getAllByText('2 Oct').length).toBeGreaterThanOrEqual(1);
  });

  it('puts a tooltip on every day, including empty ones', () => {
    const { container } = show();
    const titles = [...container.querySelectorAll('svg title')].map((t) => t.textContent);
    expect(titles).toContain('3 Oct: Rs. 400');
    expect(titles).toContain('2 Oct: nothing');
  });

  it('starts the axis at zero and tops it with a round number', () => {
    const { container } = show();
    const labels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['0', '250', '500']));
  });

  it('offers the same numbers as a table', () => {
    show();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Sales' })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('Rs. 400')).toBeInTheDocument();
    expect(screen.getByText('View as a table')).toBeInTheDocument();
  });

  it('copes with no data at all', () => {
    const { container } = show([]);
    expect(container.querySelectorAll('svg path')).toHaveLength(0);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('labels only some days on a long axis', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      label: `D${String(i)}`,
      value: i,
      detail: `D${String(i)}`,
    }));
    const { container } = show(many);
    const axis = [...container.querySelectorAll('svg text')]
      .map((t) => t.textContent)
      .filter((t) => t.startsWith('D'));
    expect(axis.length).toBeLessThan(12);
    expect(axis.length).toBeGreaterThan(4);
  });
});

describe('BarList', () => {
  it('writes the number beside every bar and sizes bars against the biggest', () => {
    const { container } = render(
      <BarList
        format={(v) => `${String(v)} sold`}
        items={[
          { label: 'Naan', value: 40 },
          { label: 'Tikka', value: 10 },
          { label: 'Nothing', value: 0 },
        ]}
      />,
    );
    expect(screen.getByText('40 sold')).toBeInTheDocument();
    expect(screen.getByText('10 sold')).toBeInTheDocument();
    const widths = [...container.querySelectorAll<HTMLElement>('li div div')].map(
      (el) => el.style.width,
    );
    expect(widths).toEqual(['100%', '25%', '2%']);
  });

  it('draws no bars when nothing was sold', () => {
    const { container } = render(<BarList format={String} items={[{ label: 'Naan', value: 0 }]} />);
    const bar = container.querySelector<HTMLElement>('li div div');
    expect(bar?.style.width).toBe('0%');
  });
});

describe('AnalyticsView', () => {
  const NOW = new Date('2026-10-17T16:00:00Z');
  const range = resolveRange({ preset: '7d' }, NOW);
  const order = (overrides: Partial<AnalyticsOrder> = {}): AnalyticsOrder => ({
    createdAt: NOW,
    status: 'COMPLETED',
    type: 'DELIVERY',
    subtotal: 1000,
    couponDiscount: 100,
    deliveryCharge: 100,
    taxAmount: 0,
    grandTotal: 1000,
    registered: true,
    items: [{ name: 'Chicken Tikka', quantity: 2, subtotal: 1000 }],
    ...overrides,
  });
  const report = (orders: AnalyticsOrder[], earlier: AnalyticsOrder[] = []): AnalyticsReport => {
    const before = previousRange(range);
    return {
      range,
      current: buildAnalytics(orders, range),
      previous: buildAnalytics(
        earlier.map((o) => ({ ...o, createdAt: new Date(before.start.getTime() + 3_600_000) })),
        before,
      ),
    };
  };
  const show = async (r: AnalyticsReport) => render(await AnalyticsView({ report: r }));

  it('shows the headline numbers and how they compare with before', async () => {
    await show(report([order(), order({ grandTotal: 500 })], [order({ grandTotal: 750 })]));
    expect(screen.getAllByText('Rs. 1,500').length).toBeGreaterThan(0); // sales (also in the table)
    // Orders went from 1 to 2 and sales from Rs. 750 to Rs. 1,500: both up 100%.
    expect(screen.getAllByText('Up 100% on the dates before')).toHaveLength(2);
    expect(screen.getAllByText('Rs. 750').length).toBeGreaterThan(0); // average
    expect(screen.getAllByText('Rs. 200').length).toBeGreaterThan(0); // discounts (card and breakdown)
    expect(screen.getByText('Showing 11 Oct to 17 Oct', { exact: false })).toBeInTheDocument();
  });

  it('says there is nothing to compare with when the dates before were empty', async () => {
    await show(report([order()]));
    expect(screen.getAllByText('No earlier orders to compare with').length).toBeGreaterThan(0);
  });

  it('shows best sellers, order types and signed-in versus guest orders', async () => {
    await show(
      report([
        order(),
        order({
          registered: false,
          type: 'PICKUP',
          items: [{ name: 'Naan', quantity: 6, subtotal: 180 }],
        }),
      ]),
    );
    expect(screen.getByText('Chicken Tikka')).toBeInTheDocument();
    expect(screen.getByText('6 sold')).toBeInTheDocument();
    expect(
      screen.getByText('1 order from signed-in customers and 1 order from guests.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sales each day' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Orders by hour' })).toBeInTheDocument();
  });

  it('says so, and leaves out the charts, when there are no orders', async () => {
    await show(report([]));
    expect(screen.getByText('No orders in these dates.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('reports cancelled orders and their share', async () => {
    await show(
      report([
        order(),
        order({ status: 'CANCELLED' }),
        order({ status: 'CANCELLED' }),
        order({ status: 'CANCELLED' }),
      ]),
    );
    expect(screen.getByText('75% of orders received')).toBeInTheDocument();
  });

  it('offers date presets, marking the one in use, and a custom range', async () => {
    await show(report([order()]));
    const nav = screen.getByRole('navigation', { name: 'Choose dates' });
    expect(within(nav).getByRole('link', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Today' })).toHaveAttribute(
      'href',
      '/admin?preset=today',
    );
    expect(within(nav).getByRole('link', { name: 'Last 30 days' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(nav).getByLabelText('From')).toHaveValue('2026-10-11');
    expect(within(nav).getByLabelText('To')).toHaveValue('2026-10-17');
  });

  it('links to the three spreadsheets for the same dates', async () => {
    await show(report([order()]));
    for (const [name, kind] of [
      ['Every order', 'orders'],
      ['Items sold', 'products'],
      ['Sales by day', 'daily'],
    ] as const) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        `/api/v1/admin/analytics/export?kind=${kind}&preset=7d`,
      );
    }
  });

  it('keeps a custom range in the download links', async () => {
    const custom = resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-05' }, NOW);
    await show({
      range: custom,
      current: buildAnalytics([], custom),
      previous: buildAnalytics([], previousRange(custom)),
    });
    expect(screen.getByRole('link', { name: 'Every order' }).getAttribute('href')).toContain(
      'preset=custom&from=2026-10-01&to=2026-10-05',
    );
  });
});
