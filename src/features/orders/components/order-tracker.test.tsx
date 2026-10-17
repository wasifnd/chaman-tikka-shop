// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';
import type { OrderSnapshot } from '../types/snapshot.types';
import { OrderTracker } from './OrderTracker';

type Listener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  fail() {
    this.onerror?.();
  }
  emit(type: string, data: string, lastEventId: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data, lastEventId }));
    }
  }
  send(id: number, status: string, minutes = id) {
    this.emit(
      'order.status_changed',
      JSON.stringify({
        type: 'order.status_changed',
        status,
        at: new Date(Date.UTC(2026, 9, 16, 14, minutes)).toISOString(),
      }),
      String(id),
    );
  }
}

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 16, 14, minutes)).toISOString();
const TOKEN = '11111111-1111-4111-8111-111111111111';

const snapshot = (overrides: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  orderNumber: 'BBQ-2026-0042',
  status: 'RECEIVED',
  type: 'DELIVERY',
  createdAt: at(0),
  estimatedReadyAt: at(30),
  areaName: 'Johar Town',
  items: [
    { name: 'Chicken Tikka', options: ['Half', 'Raita'], quantity: 2, lineTotal: 1460 },
    { name: 'Naan', options: [], quantity: 1, lineTotal: 30 },
  ],
  subtotal: 1490,
  couponDiscount: 0,
  deliveryCharge: 100,
  taxAmount: 0,
  grandTotal: 1590,
  timeline: [{ status: 'RECEIVED', at: at(0) }],
  lastEventId: 5,
  serverTime: at(10),
  ...overrides,
});

function show(overrides: Partial<OrderSnapshot> = {}, justPlaced = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrderTracker token={TOKEN} snapshot={snapshot(overrides)} justPlaced={justPlaced} />
    </NextIntlClientProvider>,
  );
}

const source = () => FakeEventSource.instances.at(-1) as FakeEventSource;
const steps = () =>
  within(screen.getByRole('region', { name: 'Order progress' })).getAllByRole('listitem');

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 16, 14, 10)));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('what the customer sees', () => {
  it('shows the order number, status, area and items', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Order BBQ-2026-0042' })).toBeInTheDocument();
    expect(screen.getByText('Order received', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Delivering to Johar Town')).toBeInTheDocument();
    expect(screen.getByText(/2 × Chicken Tikka/)).toBeInTheDocument();
    expect(screen.getByText('Half, Raita')).toBeInTheDocument();
    expect(screen.getByText('Rs. 1,590')).toBeInTheDocument();
  });

  it('marks the current step for assistive technology', () => {
    show({ status: 'PREPARING' });
    const current = steps().filter((step) => step.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Being prepared');
    expect(steps()).toHaveLength(6); // delivery journey
  });

  it('shows the estimate while the kitchen is working, and "almost ready" once it has passed', () => {
    show({ status: 'PREPARING' });
    expect(screen.getByText(/Ready around/)).toBeInTheDocument();
    cleanup();
    // Rendered by the server at 15:00, after the 14:30 estimate.
    show({ status: 'PREPARING', serverTime: at(60) });
    expect(screen.getByText('Almost ready')).toBeInTheDocument();
  });

  it('stops showing an estimate once the food is ready', () => {
    show({ status: 'READY' });
    expect(screen.queryByText(/Ready around/)).toBeNull();
    expect(screen.queryByText('Almost ready')).toBeNull();
  });

  it('tells delivery customers to pay on arrival and others to pay at the counter', () => {
    show();
    expect(screen.getByText('Pay in cash when your order arrives.')).toBeInTheDocument();
    cleanup();
    show({ type: 'PICKUP', areaName: null, deliveryCharge: 0 });
    expect(screen.getByText('Pay in cash at the counter.')).toBeInTheDocument();
    expect(screen.queryByText('Delivery', { selector: 'dt' })).toBeNull();
    expect(steps()).toHaveLength(5);
  });

  it('welcomes a customer who has just placed the order', () => {
    show({}, true);
    expect(screen.getByRole('status')).toHaveTextContent('Thank you! We have received your order.');
  });

  it('does not show the welcome when reopening the link later', () => {
    show();
    expect(screen.queryByText(/Thank you/)).toBeNull();
  });

  it('shows the discount and tax only when there are any', () => {
    show({ couponDiscount: 100, taxAmount: 50 });
    expect(screen.getByText('Coupon discount', { selector: 'dt' })).toBeInTheDocument();
    expect(screen.getByText('Tax', { selector: 'dt' })).toBeInTheDocument();
    cleanup();
    show();
    expect(screen.queryByText('Coupon discount', { selector: 'dt' })).toBeNull();
    expect(screen.queryByText('Tax', { selector: 'dt' })).toBeNull();
  });

  it('says free delivery when there is no charge', () => {
    show({ deliveryCharge: 0 });
    const row = screen.getByText('Delivery', { selector: 'dt' }).parentElement as HTMLElement;
    expect(within(row).getByText('Free')).toBeInTheDocument();
  });
});

describe('live updates', () => {
  it('connects after the last event already shown', () => {
    show({ lastEventId: 17 });
    expect(source().url).toBe(`/api/v1/orders/${TOKEN}/events?after=17`);
  });

  it('updates the status and progress as events arrive', () => {
    show();
    act(() => {
      source().open();
      source().send(6, 'CONFIRMED');
      source().send(7, 'PREPARING');
    });
    expect(screen.getByText('Being prepared', { selector: 'p' })).toBeInTheDocument();
    const states = steps().map((step) => step.getAttribute('aria-current'));
    expect(states).toEqual([null, null, 'step', null, null, null]);
  });

  it('ignores an event it already has', () => {
    show();
    act(() => {
      source().send(6, 'CONFIRMED');
      source().send(6, 'READY'); // same id replayed with different data: must not apply
    });
    expect(screen.getByText('Confirmed', { selector: 'p' })).toBeInTheDocument();
  });

  it('ignores malformed events instead of breaking', () => {
    show();
    act(() => {
      source().emit('order.status_changed', '{not json', '6');
    });
    expect(screen.getByText('Order received', { selector: 'p' })).toBeInTheDocument();
  });

  it('shows a cancelled order clearly and stops listening', () => {
    show();
    const connection = source();
    act(() => {
      connection.send(6, 'CANCELLED');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('This order was cancelled');
    expect(connection.closed).toBe(true);
  });

  it('stops listening once the order is completed', () => {
    show({ status: 'PICKED', type: 'PICKUP' });
    const connection = source();
    act(() => {
      connection.send(6, 'COMPLETED');
    });
    expect(connection.closed).toBe(true);
  });

  it('does not connect at all for an order that is already finished', () => {
    show({ status: 'COMPLETED' });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('closes the connection when the page is left', () => {
    const { unmount } = show();
    const connection = source();
    unmount();
    expect(connection.closed).toBe(true);
  });
});

describe('when the connection has trouble', () => {
  it('says nothing for the single drop that happens every time the server renews the stream', () => {
    show();
    act(() => {
      source().open();
      source().fail();
    });
    expect(screen.queryByText('Reconnecting to live updates')).toBeNull();
    expect(screen.queryByText(/paused/)).toBeNull();
  });

  it('says it is reconnecting after repeated failures, and clears when it recovers', () => {
    show();
    act(() => {
      source().fail();
      source().fail();
    });
    expect(screen.getByText('Reconnecting to live updates')).toBeInTheDocument();
    act(() => {
      source().open();
    });
    expect(screen.queryByText('Reconnecting to live updates')).toBeNull();
  });

  it('falls back to refreshing the page data when it cannot connect', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({ data: { order: snapshot({ status: 'PREPARING', lastEventId: 9 }) } }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    show();
    act(() => {
      source().fail();
      source().fail();
      source().fail();
    });
    expect(screen.getByText(/Live updates are paused/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetcher).toHaveBeenCalledWith(`/api/v1/orders/${TOKEN}`, { cache: 'no-store' });
    expect(screen.getByText('Being prepared', { selector: 'p' })).toBeInTheDocument();
  });

  it('stops refreshing once live updates are back', async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ data: { order: snapshot() } })));
    vi.stubGlobal('fetch', fetcher);
    show();
    act(() => {
      source().fail();
      source().fail();
      source().fail();
    });
    act(() => {
      source().open();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps going if a refresh fails or returns something unusable', async () => {
    const answers = [
      () => Promise.reject(new Error('offline')),
      () => Promise.resolve(new Response('nope', { status: 500 })),
      () => Promise.resolve(Response.json({ data: {} })),
      () =>
        Promise.resolve(
          Response.json({ data: { order: snapshot({ status: 'READY', lastEventId: 12 }) } }),
        ),
    ];
    const fetcher = vi.fn(() =>
      (answers.shift() ?? answers[0] ?? (() => Promise.reject(new Error('x'))))(),
    );
    vi.stubGlobal('fetch', fetcher);
    show();
    act(() => {
      source().fail();
      source().fail();
      source().fail();
    });
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
    }
    expect(screen.getByText('Ready', { selector: 'p' })).toBeInTheDocument();
  });

  it('refreshes by polling when the browser has no live-update support', async () => {
    vi.stubGlobal('EventSource', undefined);
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({ data: { order: snapshot({ status: 'CONFIRMED', lastEventId: 8 }) } }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    show();
    expect(screen.getByText(/Live updates are paused/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText('Confirmed', { selector: 'p' })).toBeInTheDocument();
  });

  it('does not let a slow, older refresh roll the order back', async () => {
    const stale = Response.json({
      data: { order: snapshot({ status: 'RECEIVED', lastEventId: 5 }) },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(stale)),
    );
    show();
    act(() => {
      source().send(8, 'READY');
      source().fail();
      source().fail();
      source().fail();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText('Ready', { selector: 'p' })).toBeInTheDocument();
  });

  it('hides connection notices once the order is finished', () => {
    show();
    act(() => {
      source().fail();
      source().fail();
      source().send(6, 'CANCELLED');
    });
    expect(screen.queryByText('Reconnecting to live updates')).toBeNull();
  });
});
