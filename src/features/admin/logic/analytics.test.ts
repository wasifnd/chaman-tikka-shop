import { describe, expect, it } from 'vitest';
import { buildAnalytics, emptySummary, percentChange, type AnalyticsOrder } from './analytics';
import {
  MAX_RANGE_DAYS,
  addDays,
  businessDayKey,
  karachiHour,
  previousRange,
  resolveRange,
} from './analytics-range';
import {
  columnPath,
  describeChange,
  formatCompact,
  formatDay,
  formatHour,
  labelStep,
  niceMax,
} from './chart-math';
import { csvCell, dailyCsv, ordersCsv, productsCsv, toCsv, type ExportOrder } from './csv';

// 9 PM in Karachi on Saturday 17 October 2026.
const NOW = new Date('2026-10-17T16:00:00Z');

describe('business days', () => {
  it('runs noon to noon in Karachi', () => {
    expect(businessDayKey(new Date('2026-10-17T07:00:00Z'))).toBe('2026-10-17'); // 12:00 sharp
    expect(businessDayKey(new Date('2026-10-17T06:59:59Z'))).toBe('2026-10-16'); // 11:59:59
    expect(businessDayKey(new Date('2026-10-17T16:00:00Z'))).toBe('2026-10-17'); // 9 PM
    expect(businessDayKey(new Date('2026-10-17T20:00:00Z'))).toBe('2026-10-17'); // 1 AM next day
    expect(businessDayKey(new Date('2026-10-18T06:59:00Z'))).toBe('2026-10-17'); // 11:59 AM next day
  });

  it('knows the hour in Karachi', () => {
    expect(karachiHour(new Date('2026-10-17T20:00:00Z'))).toBe(1);
    expect(karachiHour(new Date('2026-10-17T19:00:00Z'))).toBe(0);
    expect(karachiHour(new Date('2026-10-17T07:00:00Z'))).toBe(12);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-10-17', 0)).toBe('2026-10-17');
  });
});

describe('resolveRange', () => {
  it('today is the current business day, even after midnight', () => {
    const range = resolveRange({ preset: 'today' }, new Date('2026-10-17T20:00:00Z'));
    expect(range).toMatchObject({ from: '2026-10-17', to: '2026-10-17', preset: 'today' });
    expect(range.start.toISOString()).toBe('2026-10-17T07:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-18T07:00:00.000Z');
  });

  it('yesterday, 7 days and 30 days end where expected', () => {
    expect(resolveRange({ preset: 'yesterday' }, NOW)).toMatchObject({
      from: '2026-10-16',
      to: '2026-10-16',
    });
    const week = resolveRange({ preset: '7d' }, NOW);
    expect([week.from, week.to, week.days.length]).toEqual(['2026-10-11', '2026-10-17', 7]);
    const month = resolveRange({ preset: '30d' }, NOW);
    expect([month.from, month.to, month.days.length]).toEqual(['2026-09-18', '2026-10-17', 30]);
  });

  it('defaults to 7 days for nothing or nonsense', () => {
    for (const preset of [undefined, '', 'forever', '7D']) {
      expect(resolveRange({ preset }, NOW).days).toHaveLength(7);
    }
  });

  it('accepts a custom range and stops at today', () => {
    const range = resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-05' }, NOW);
    expect([range.preset, range.from, range.to, range.days.length]).toEqual([
      'custom',
      '2026-10-01',
      '2026-10-05',
      5,
    ]);
    const future = resolveRange({ preset: 'custom', from: '2026-10-15', to: '2030-01-01' }, NOW);
    expect(future.to).toBe('2026-10-17');
  });

  it.each([
    ['backwards', { from: '2026-10-05', to: '2026-10-01' }],
    ['impossible date', { from: '2026-02-30', to: '2026-03-02' }],
    ['not a date', { from: 'abc', to: '2026-10-01' }],
    ['missing end', { from: '2026-10-01' }],
    ['entirely in the future', { from: '2030-01-01', to: '2030-01-05' }],
    ['too long', { from: '2026-01-01', to: '2026-10-01' }],
  ])('falls back to the last 7 days for a %s', (_label, input) => {
    const range = resolveRange({ preset: 'custom', ...input }, NOW);
    expect(range.preset).toBe('7d');
    expect(range.days).toHaveLength(7);
  });

  it('allows exactly the longest range', () => {
    const to = '2026-10-17';
    const from = addDays(to, -(MAX_RANGE_DAYS - 1));
    expect(resolveRange({ preset: 'custom', from, to }, NOW).days).toHaveLength(MAX_RANGE_DAYS);
    expect(resolveRange({ preset: 'custom', from: addDays(from, -1), to }, NOW).preset).toBe('7d');
  });

  it('works out the stretch just before', () => {
    const before = previousRange(resolveRange({ preset: '7d' }, NOW));
    expect([before.from, before.to, before.days.length]).toEqual(['2026-10-04', '2026-10-10', 7]);
    expect(before.end.toISOString()).toBe('2026-10-11T07:00:00.000Z');
  });
});

const order = (overrides: Partial<AnalyticsOrder> = {}): AnalyticsOrder => ({
  createdAt: new Date('2026-10-17T16:00:00Z'),
  status: 'COMPLETED',
  type: 'PICKUP',
  subtotal: 500,
  couponDiscount: 0,
  deliveryCharge: 0,
  taxAmount: 0,
  grandTotal: 500,
  registered: false,
  items: [{ name: 'Tikka', quantity: 1, subtotal: 500 }],
  ...overrides,
});

describe('buildAnalytics', () => {
  const week = resolveRange({ preset: '7d' }, NOW);

  it('is all zeros, with every day present, when there are no orders', () => {
    const result = buildAnalytics([], week);
    expect(result.summary).toEqual(emptySummary());
    expect(result.daily).toHaveLength(7);
    expect(result.daily.every((d) => d.orders === 0 && d.revenue === 0)).toBe(true);
    expect(result.hours).toHaveLength(24);
    expect(result.topProducts).toEqual([]);
  });

  it('adds up sales, averages and the pieces of each order', () => {
    const result = buildAnalytics(
      [
        order({
          subtotal: 1000,
          couponDiscount: 100,
          deliveryCharge: 100,
          taxAmount: 50,
          grandTotal: 1050,
          registered: true,
        }),
        order({ grandTotal: 450.5, subtotal: 450.5 }),
      ],
      week,
    );
    expect(result.summary).toMatchObject({
      orders: 2,
      revenue: 1500.5,
      averageOrder: 750.25,
      discounts: 100,
      deliveryFees: 100,
      tax: 50,
      registeredOrders: 1,
      guestOrders: 1,
      itemsSold: 2,
    });
  });

  it('counts cancelled orders only as cancelled', () => {
    const result = buildAnalytics(
      [
        order(),
        order({ status: 'CANCELLED', grandTotal: 9999, couponDiscount: 5 }),
        order({ status: 'CANCELLED' }),
      ],
      week,
    );
    expect(result.summary).toMatchObject({
      orders: 1,
      revenue: 500,
      cancelled: 2,
      discounts: 0,
      itemsSold: 1,
    });
    expect(result.summary.cancelRate).toBeCloseTo(2 / 3);
    expect(result.daily.at(-1)).toMatchObject({ orders: 1, revenue: 500 });
    expect(result.byType.find((t) => t.type === 'PICKUP')).toMatchObject({ orders: 1 });
  });

  it('has no cancel rate when nothing came in, and does not divide by zero', () => {
    const result = buildAnalytics([order({ status: 'CANCELLED' })], week);
    expect(result.summary).toMatchObject({ orders: 0, averageOrder: 0, cancelRate: 1 });
    expect(buildAnalytics([], week).summary.cancelRate).toBe(0);
  });

  it('adds money exactly, to the paisa', () => {
    const thirds = Array.from({ length: 3 }, () => order({ grandTotal: 33.33 }));
    expect(buildAnalytics(thirds, week).summary.revenue).toBe(99.99);
    const tenths = Array.from({ length: 10 }, () => order({ grandTotal: 0.1 }));
    expect(buildAnalytics(tenths, week).summary.revenue).toBe(1);
  });

  it('puts an order placed after midnight on the evening it belongs to', () => {
    const lateNight = order({ createdAt: new Date('2026-10-17T20:00:00Z') }); // 1 AM on the 18th
    const morning = order({ createdAt: new Date('2026-10-17T05:00:00Z') }); // 10 AM on the 17th: yesterday's trading day
    const result = buildAnalytics([lateNight, morning], week);
    expect(result.daily.find((d) => d.day === '2026-10-17')?.orders).toBe(1);
    expect(result.daily.find((d) => d.day === '2026-10-16')?.orders).toBe(1);
  });

  it('ignores orders outside the dates', () => {
    const result = buildAnalytics(
      [
        order({ createdAt: new Date('2026-10-10T06:00:00Z') }), // before the first day began
        order({ createdAt: new Date('2026-10-18T07:00:00Z') }), // exactly when the day after begins
        order({ createdAt: new Date('2026-10-11T07:00:00Z') }), // first moment: included
        order({ createdAt: new Date('2026-10-18T06:59:59Z') }), // last moment: included
      ],
      week,
    );
    expect(result.summary.orders).toBe(2);
  });

  it('counts orders by hour starting from noon', () => {
    const result = buildAnalytics(
      [
        order({ createdAt: new Date('2026-10-17T16:00:00Z') }), // 9 PM
        order({ createdAt: new Date('2026-10-17T16:30:00Z') }), // 9:30 PM
        order({ createdAt: new Date('2026-10-17T20:00:00Z') }), // 1 AM
      ],
      week,
    );
    expect(result.hours.map((h) => h.hour).slice(0, 3)).toEqual([12, 13, 14]);
    expect(result.hours.at(-1)?.hour).toBe(11);
    expect(result.hours.find((h) => h.hour === 21)?.orders).toBe(2);
    expect(result.hours.find((h) => h.hour === 1)?.orders).toBe(1);
    expect(result.hours.reduce((sum, h) => sum + h.orders, 0)).toBe(3);
  });

  it('splits orders and sales by type, always listing all three', () => {
    const result = buildAnalytics(
      [
        order({ type: 'DELIVERY', grandTotal: 700 }),
        order({ type: 'DELIVERY', grandTotal: 300 }),
        order({ type: 'DINE_IN' }),
      ],
      week,
    );
    expect(result.byType).toEqual([
      { type: 'DELIVERY', orders: 2, revenue: 1000 },
      { type: 'PICKUP', orders: 0, revenue: 0 },
      { type: 'DINE_IN', orders: 1, revenue: 500 },
    ]);
  });

  it('ranks best sellers by quantity, then sales, then name, and keeps the top ten', () => {
    const items = (name: string, quantity: number, subtotal: number) => ({
      name,
      quantity,
      subtotal,
    });
    const result = buildAnalytics(
      [
        order({ items: [items('Naan', 10, 300), items('Tikka', 3, 1050)] }),
        order({ items: [items('Naan', 2, 60), items('Raita', 3, 150), items('Boti', 3, 150)] }),
      ],
      week,
    );
    expect(result.topProducts.map((p) => [p.name, p.quantity, p.revenue])).toEqual([
      ['Naan', 12, 360],
      ['Tikka', 3, 1050],
      ['Boti', 3, 150],
      ['Raita', 3, 150],
    ]);

    const many = order({
      items: Array.from({ length: 15 }, (_, i) =>
        items(`Dish ${String(i).padStart(2, '0')}`, 15 - i, 10),
      ),
    });
    expect(buildAnalytics([many], week).topProducts).toHaveLength(10);
    expect(buildAnalytics([many], week, Number.POSITIVE_INFINITY).topProducts).toHaveLength(15);
  });
});

describe('percentChange and describeChange', () => {
  it('compares with before', () => {
    expect(percentChange(150, 100)).toBe(0.5);
    expect(percentChange(50, 100)).toBe(-0.5);
    expect(percentChange(100, 100)).toBe(0);
    expect(percentChange(10, 0)).toBeNull();
  });

  it('puts it in words', () => {
    expect(describeChange(null)).toEqual({ kind: 'none' });
    expect(describeChange(0.256)).toEqual({ kind: 'up', percent: 26 });
    expect(describeChange(-0.5)).toEqual({ kind: 'down', percent: 50 });
    expect(describeChange(0.004)).toEqual({ kind: 'flat' });
    expect(describeChange(0)).toEqual({ kind: 'flat' });
  });
});

describe('chart maths', () => {
  it.each([
    [0, 1],
    [-5, 1],
    [0.7, 1],
    [1, 1],
    [1.1, 2],
    [3, 5],
    [5, 5],
    [6, 10],
    [87, 100],
    [1234, 2000],
    [45_000, 50_000],
    [99_999, 100_000],
  ])('rounds an axis top of %f up to %f', (value, expected) => {
    expect(niceMax(value)).toBe(expected);
  });

  it('picks a label step that keeps about eight labels', () => {
    expect(labelStep(7)).toBe(1);
    expect(labelStep(8)).toBe(1);
    expect(labelStep(30)).toBe(4);
    expect(labelStep(92)).toBe(12);
    expect(labelStep(0)).toBe(1);
  });

  it('shortens big numbers', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(1250)).toBe('1.3k');
    expect(formatCompact(12_000)).toBe('12k');
    expect(formatCompact(2_500_000)).toBe('2.5M');
    expect(formatCompact(0.5)).toBe('0.5');
  });

  it('writes days and hours for people', () => {
    expect(formatDay('2026-10-07')).toBe('7 Oct');
    expect(formatDay('2026-01-31')).toBe('31 Jan');
    expect(formatHour(0)).toBe('12 AM');
    expect(formatHour(12)).toBe('12 PM');
    expect(formatHour(18)).toBe('6 PM');
    expect(formatHour(1)).toBe('1 AM');
  });

  it('draws a column with a rounded top that sits flat on its baseline', () => {
    const path = columnPath(10, 20, 20, 50);
    expect(path.startsWith('M10 70')).toBe(true); // starts at the bottom-left, on the baseline
    expect(path.endsWith('V70Z')).toBe(true); // ends back on the baseline
    expect(path).toContain('Q10 20');
    expect(columnPath(0, 0, 10, 0)).toBe('');
    expect(columnPath(0, 0, 0, 10)).toBe('');
    // A very short column keeps its curve inside its own height.
    expect(columnPath(0, 96, 20, 2)).toContain('Q0 96 2 96');
  });
});

describe('csv', () => {
  it('leaves plain text and numbers as they are, and empties for nothing', () => {
    expect(csvCell('Ali Khan')).toBe('Ali Khan');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(-50)).toBe('-50');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('yes');
    expect(csvCell(false)).toBe('no');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Khan, Ali')).toBe('"Khan, Ali"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it.each(['=1+1', '+92300', '-cmd', '@SUM(A1)', '\tTab', '\rReturn'])(
    'defuses the spreadsheet formula %j',
    (text) => {
      expect(csvCell(text).replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('builds a file Excel opens correctly: BOM first, CRLF lines', () => {
    const file = toCsv(
      ['A', 'B'],
      [
        [1, 'x'],
        [2, 'y,z'],
      ],
    );
    expect(file.charCodeAt(0)).toBe(0xfeff);
    expect(file.slice(1)).toBe('A,B\r\n1,x\r\n2,"y,z"\r\n');
  });

  const exported: ExportOrder = {
    orderNumber: 'BBQ-2026-0001',
    createdAt: '2026-10-17T16:00:00.000Z',
    type: 'DELIVERY',
    status: 'COMPLETED',
    customerName: '=HYPERLINK("http://evil")',
    phone: '03001234567',
    registered: true,
    subtotal: 1000,
    couponDiscount: 100,
    deliveryCharge: 100,
    taxAmount: 0,
    grandTotal: 1000,
    paymentMethod: 'COD',
    paymentStatus: 'PAID',
    couponCode: null,
  };

  it('writes orders in Karachi time and defuses hostile customer names', () => {
    const lines = ordersCsv([exported]).slice(1).split('\r\n');
    expect(lines[0]).toContain('Placed (Karachi time)');
    expect(lines[1]).toContain('BBQ-2026-0001,2026-10-17 21:00,DELIVERY,COMPLETED');
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(lines[1]).toContain(',yes,1000,100,100,0,1000,COD,PAID,');
  });

  it('writes items sold and daily sales', () => {
    expect(productsCsv([{ name: 'Tikka', quantity: 3, revenue: 1050 }])).toBe(
      '﻿Item,Quantity sold,Sales\r\nTikka,3,1050\r\n',
    );
    expect(dailyCsv([{ day: '2026-10-17', orders: 2, revenue: 900 }])).toBe(
      '﻿Business day,Orders,Sales\r\n2026-10-17,2,900\r\n',
    );
  });
});
