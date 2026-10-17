// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';
import { FakeEventSource } from '../testing/fake-event-source';
import type { StaffOrder } from '../types/staff-order.types';
import { KitchenDisplay } from './KitchenDisplay';
import { StoreBoard } from './StoreBoard';
import { StoreNav } from './StoreNav';

vi.mock('next/navigation', () => ({ usePathname: () => '/store/kitchen' }));

const SERVER_TIME = '2026-10-16T14:10:00.000Z';
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 16, 14, minutes)).toISOString();

const order = (
  id: string,
  status: StaffOrder['status'],
  overrides: Partial<StaffOrder> = {},
): StaffOrder => ({
  id,
  orderNumber: `BBQ-${id}`,
  status,
  type: 'DELIVERY',
  createdAt: at(0),
  estimatedReadyAt: at(40),
  customerName: `Customer ${id}`,
  phone: '03001234567',
  address: { line1: 'House 12', line2: null, area: 'Johar Town' },
  instructions: null,
  items: [{ name: `Dish ${id}`, options: ['Half'], quantity: 2, note: null }],
  subtotal: 100,
  couponDiscount: 0,
  deliveryCharge: 0,
  taxAmount: 0,
  grandTotal: 100,
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  cancelReason: null,
  ...overrides,
});

let active: StaffOrder[];
let finished: StaffOrder[];
let lastEventId: number;
let patchHandler: (
  id: string,
  body: { status: string; reason?: string },
) => Response | Promise<Response>;
let listStatus = 200;
const patches: { id: string; body: { status: string; reason?: string } }[] = [];
const ok = (data: unknown) => Response.json({ success: true, data });

/** What the real server does: apply the change, and move finished orders to the finished list. */
const applyChange: typeof patchHandler = (id, body) => {
  const target = active.find((o) => o.id === id);
  if (target) {
    const status = body.status as StaffOrder['status'];
    const updated = { ...target, status, cancelReason: body.reason ?? null };
    active = active.filter((o) => o.id !== id);
    if (status === 'COMPLETED' || status === 'CANCELLED') finished = [updated, ...finished];
    else active = [...active, updated];
  }
  return ok({ result: {} });
};

function install() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      if (input.startsWith('/api/v1/store/orders?')) {
        if (listStatus !== 200) return Promise.resolve(new Response('{}', { status: listStatus }));
        const list = input.includes('scope=finished') ? finished : active;
        return Promise.resolve(ok({ orders: list, lastEventId, serverTime: SERVER_TIME }));
      }
      if (init?.method === 'PATCH') {
        const id = /orders\/([^/]+)\/status/.exec(input)?.[1] ?? '';
        const raw = init.body;
        const body = JSON.parse(typeof raw === 'string' ? raw : '{}') as {
          status: string;
          reason?: string;
        };
        patches.push({ id, body });
        return Promise.resolve(patchHandler(id, body));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    }),
  );
}

function show(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

// A column's accessible name is its title followed by its count ("New 1"), so match the start.
const column = (title: string) =>
  within(screen.getByRole('region', { name: new RegExp(`^${title}`) }));
const card = (number: string) =>
  screen.getByRole('heading', { name: number }).closest('li') as HTMLElement;

beforeEach(() => {
  FakeEventSource.reset();
  patches.length = 0;
  listStatus = 200;
  active = [
    order('new1', 'RECEIVED', { createdAt: at(8) }),
    order('cook1', 'PREPARING', { createdAt: at(1) }),
    order('cook2', 'CONFIRMED', { createdAt: at(3) }),
    order('ready1', 'READY'),
    order('out1', 'OUT_FOR_DELIVERY'),
  ];
  finished = [
    order('done1', 'COMPLETED'),
    order('cancelled1', 'CANCELLED', { cancelReason: 'Out of chicken' }),
  ];
  lastEventId = 30;
  patchHandler = applyChange;
  window.localStorage.clear();
  vi.stubGlobal('EventSource', FakeEventSource);
  install();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.title = '';
});

describe('the order board', () => {
  it('shows a loading state, then orders in the right columns', async () => {
    const { container } = show(<StoreBoard />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

    await screen.findByRole('heading', { name: 'BBQ-new1' });
    expect(column('New').getByRole('heading', { name: 'BBQ-new1' })).toBeInTheDocument();
    expect(
      column('In the kitchen')
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'BBQ-cook1', // oldest first
      'BBQ-cook2',
    ]);
    expect(column('Ready').getByRole('heading', { name: 'BBQ-ready1' })).toBeInTheDocument();
    expect(
      column('On its way / handed over').getByRole('heading', { name: 'BBQ-out1' }),
    ).toBeInTheDocument();
  });

  it('says so when there is nothing to do, and shows empty columns', async () => {
    active = [];
    show(<StoreBoard />);
    expect(await screen.findByText(/No active orders/)).toBeInTheDocument();
    expect(screen.getAllByText('Nothing here')).toHaveLength(4);
  });

  it('puts the number of waiting orders in the tab title', async () => {
    show(<StoreBoard />);
    await screen.findByRole('heading', { name: 'BBQ-new1' });
    await waitFor(() => {
      expect(document.title).toBe('(1) Store orders');
    });
  });

  it('shows the connection state', async () => {
    show(<StoreBoard />);
    await screen.findByRole('heading', { name: 'BBQ-new1' });
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    expect(screen.getByText('Connecting')).toBeInTheDocument();
    FakeEventSource.last.open();
    expect(await screen.findByText('Live')).toBeInTheDocument();
  });

  describe('moving an order', () => {
    it('accepts a new order: it jumps to the kitchen column at once and the server is told', async () => {
      let release: () => void = () => undefined;
      patchHandler = () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(ok({ result: {} }));
          };
        });
      show(<StoreBoard />);
      await screen.findByRole('heading', { name: 'BBQ-new1' });

      fireEvent.click(within(card('BBQ-new1')).getByRole('button', { name: 'Accept' }));
      await waitFor(() => {
        expect(
          column('In the kitchen').getByRole('heading', { name: 'BBQ-new1' }),
        ).toBeInTheDocument();
      });
      expect(patches).toEqual([{ id: 'new1', body: { status: 'CONFIRMED' } }]);
      release();
    });

    it('locks only the order being saved, so other orders can still be worked on', async () => {
      patchHandler = () => new Promise<Response>(() => undefined);
      show(<StoreBoard />);
      await screen.findByRole('heading', { name: 'BBQ-new1' });
      fireEvent.click(within(card('BBQ-new1')).getByRole('button', { name: 'Accept' }));

      await waitFor(() => {
        for (const button of within(card('BBQ-new1')).getAllByRole('button')) {
          expect(button).toBeDisabled();
        }
      });
      // Every other order's buttons stay usable while that save is pending.
      for (const number of ['BBQ-cook1', 'BBQ-cook2', 'BBQ-ready1', 'BBQ-out1']) {
        for (const button of within(card(number)).getAllByRole('button')) {
          expect(button).toBeEnabled();
        }
      }
    });

    it('rejects with a reason', async () => {
      show(<StoreBoard />);
      await screen.findByRole('heading', { name: 'BBQ-new1' });
      fireEvent.click(within(card('BBQ-new1')).getByRole('button', { name: 'Reject' }));
      fireEvent.change(screen.getByLabelText('Reason (shown to staff)'), {
        target: { value: 'Closing early' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() => {
        expect(patches).toEqual([
          { id: 'new1', body: { status: 'CANCELLED', reason: 'Closing early' } },
        ]);
      });
      // A cancelled order leaves the board.
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'BBQ-new1' })).toBeNull();
      });
    });

    it('puts the order back and explains when someone else got there first', async () => {
      patchHandler = () =>
        Response.json(
          { success: false, error: { code: 'INVALID_TRANSITION', message: 'raw server text' } },
          { status: 409 },
        );
      show(<StoreBoard />);
      await screen.findByRole('heading', { name: 'BBQ-new1' });
      fireEvent.click(within(card('BBQ-new1')).getByRole('button', { name: 'Accept' }));

      expect(
        await screen.findByText(/Someone else already updated this order/),
      ).toBeInTheDocument();
      expect(column('New').getByRole('heading', { name: 'BBQ-new1' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      await waitFor(() => {
        expect(screen.queryByText(/Someone else already updated/)).toBeNull();
      });
    });

    it('shows a generic message for other failures', async () => {
      patchHandler = () => new Response('oops', { status: 500 });
      show(<StoreBoard />);
      await screen.findByRole('heading', { name: 'BBQ-new1' });
      fireEvent.click(within(card('BBQ-new1')).getByRole('button', { name: 'Accept' }));
      expect(
        await screen.findByText('Could not update the order. Please try again.'),
      ).toBeInTheDocument();
    });
  });

  describe('live updates', () => {
    it('announces a new order and shows it', async () => {
      show(<StoreBoard />);
      await screen.findByRole('heading', { name: 'BBQ-new1' });
      await waitFor(() => {
        expect(FakeEventSource.instances).toHaveLength(1);
      });

      active = [...active, order('new2', 'RECEIVED', { createdAt: at(9) })];
      FakeEventSource.last.send(
        31,
        { orderId: 'new2', orderNumber: 'BBQ-new2', status: 'RECEIVED', at: at(9) },
        'order.created',
      );
      expect(await screen.findByText('New order BBQ-new2')).toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: 'BBQ-new2' })).toBeInTheDocument();
      await waitFor(() => {
        expect(document.title).toBe('(2) Store orders');
      });

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByText('New order BBQ-new2')).toBeNull();
    });

    it("follows another person's change without a reload", async () => {
      show(<StoreBoard />);
      await screen.findByRole('heading', { name: 'BBQ-new1' });
      await waitFor(() => {
        expect(FakeEventSource.instances).toHaveLength(1);
      });
      active = active.map((o) =>
        o.id === 'ready1' ? { ...o, status: 'OUT_FOR_DELIVERY' as const } : o,
      );
      FakeEventSource.last.send(31, {
        orderId: 'ready1',
        orderNumber: 'BBQ-ready1',
        status: 'OUT_FOR_DELIVERY',
        at: at(10),
      });
      await waitFor(() => {
        expect(
          column('On its way / handed over').getByRole('heading', { name: 'BBQ-ready1' }),
        ).toBeInTheDocument();
      });
    });
  });

  describe('when things go wrong', () => {
    it('offers to log in again when the session has ended', async () => {
      listStatus = 401;
      show(<StoreBoard />);
      expect(await screen.findByText('Your session has ended.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Log in again' })).toHaveAttribute(
        'href',
        '/auth/login?next=/store/orders',
      );
    });

    it('offers a retry when the orders cannot be loaded', async () => {
      listStatus = 500;
      show(<StoreBoard />);
      expect(await screen.findByText('Could not load orders.')).toBeInTheDocument();
      listStatus = 200;
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('heading', { name: 'BBQ-new1' })).toBeInTheDocument();
    });
  });

  describe('recently finished orders', () => {
    it('loads them only when asked', async () => {
      show(<StoreBoard />);
      await screen.findByRole('heading', { name: 'BBQ-new1' });
      const finishedCalls = () =>
        vi
          .mocked(fetch)
          .mock.calls.filter(([url]) => typeof url === 'string' && url.includes('scope=finished'))
          .length;
      expect(finishedCalls()).toBe(0);

      fireEvent.click(screen.getByRole('button', { name: 'Show recently finished orders' }));
      expect(await screen.findByText('BBQ-cancelled1', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('Cancelled: Out of chicken')).toBeInTheDocument();
      expect(finishedCalls()).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole('button', { name: 'Hide recently finished orders' }));
      expect(screen.queryByText('BBQ-cancelled1', { exact: false })).toBeNull();
    });

    it('says when nothing has finished', async () => {
      finished = [];
      show(<StoreBoard />);
      await screen.findByRole('heading', { name: 'BBQ-new1' });
      fireEvent.click(screen.getByRole('button', { name: 'Show recently finished orders' }));
      expect(await screen.findByText('Nothing finished in the last 12 hours.')).toBeInTheDocument();
    });
  });

  it('lets staff turn the sound on and off', async () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class {
        state = 'running';
        currentTime = 0;
        destination = {};
        resume = () => Promise.resolve();
        createOscillator = () => ({
          type: '',
          frequency: { value: 0 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        });
        createGain = () => ({
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        });
      },
    });
    show(<StoreBoard />);
    await screen.findByRole('heading', { name: 'BBQ-new1' });
    const toggle = screen.getByRole('button', { name: 'Turn on sound' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(await screen.findByRole('button', { name: 'Turn off sound' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Sound on')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off sound' }));
    expect(await screen.findByRole('button', { name: 'Turn on sound' })).toBeInTheDocument();
    Reflect.deleteProperty(window, 'AudioContext');
  });
});

describe('the kitchen display', () => {
  const tickets = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

  it('shows only what has to be cooked, oldest first', async () => {
    show(<KitchenDisplay />);
    await screen.findByRole('heading', { name: 'BBQ-cook1' });
    expect(tickets()).toEqual(['BBQ-cook1', 'BBQ-cook2']);
    expect(screen.queryByText('BBQ-new1')).toBeNull();
    expect(screen.queryByText('BBQ-ready1')).toBeNull();
  });

  it('leaves out contact details, addresses and prices', async () => {
    show(<KitchenDisplay />);
    await screen.findByRole('heading', { name: 'BBQ-cook1' });
    expect(screen.queryByText(/03001234567/)).toBeNull();
    expect(screen.queryByText(/House 12/)).toBeNull();
    expect(screen.queryByText(/Customer cook1/)).toBeNull();
    expect(screen.queryByText(/Rs\./)).toBeNull();
  });

  it('shows items large with their options, notes and the kitchen instructions', async () => {
    active = [
      order('c', 'PREPARING', {
        instructions: 'extra spicy',
        items: [{ name: 'Tikka', options: ['Half', 'Raita'], quantity: 3, note: 'no onions' }],
      }),
    ];
    show(<KitchenDisplay />);
    expect(await screen.findByText(/3 × Tikka/)).toBeInTheDocument();
    expect(screen.getByText('Half, Raita')).toBeInTheDocument();
    expect(screen.getByText('Note: no onions')).toBeInTheDocument();
    expect(screen.getByText('extra spicy')).toBeInTheDocument();
  });

  it('has one big forward button per ticket and no way to cancel', async () => {
    show(<KitchenDisplay />);
    await screen.findByRole('heading', { name: 'BBQ-cook1' });
    expect(
      within(card('BBQ-cook1'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Ready']);
    expect(
      within(card('BBQ-cook2'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Start']);
    expect(screen.queryByRole('button', { name: /Cancel|Reject/ })).toBeNull();
  });

  it('starts cooking, then marks the order ready and takes it off the screen', async () => {
    show(<KitchenDisplay />);
    await screen.findByRole('heading', { name: 'BBQ-cook2' });

    fireEvent.click(within(card('BBQ-cook2')).getByRole('button', { name: 'Start' }));
    await waitFor(() => {
      expect(within(card('BBQ-cook2')).getByRole('button', { name: 'Ready' })).toBeInTheDocument();
    });

    fireEvent.click(within(card('BBQ-cook1')).getByRole('button', { name: 'Ready' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'BBQ-cook1' })).toBeNull();
    });
    expect(patches.map((p) => [p.id, p.body.status])).toEqual([
      ['cook2', 'PREPARING'],
      ['cook1', 'READY'],
    ]);
  });

  it('colours tickets by how late they are against the promised time', async () => {
    active = [
      order('fine', 'PREPARING', { estimatedReadyAt: at(40) }),
      order('late', 'PREPARING', { estimatedReadyAt: at(5) }),
    ];
    show(<KitchenDisplay />);
    await screen.findByRole('heading', { name: 'BBQ-fine' });
    expect(card('BBQ-fine')).toHaveAttribute('data-urgency', 'ok');
    expect(card('BBQ-late')).toHaveAttribute('data-urgency', 'late');
  });

  it('says when there is nothing to cook', async () => {
    active = [order('new1', 'RECEIVED')];
    show(<KitchenDisplay />);
    expect(await screen.findByText('Nothing to cook right now.')).toBeInTheDocument();
  });

  it('shows the same session-ended notice as the board', async () => {
    listStatus = 401;
    show(<KitchenDisplay />);
    expect(await screen.findByText('Your session has ended.')).toBeInTheDocument();
  });

  it('offers a retry when it cannot load', async () => {
    listStatus = 500;
    show(<KitchenDisplay />);
    expect(await screen.findByText('Could not load orders.')).toBeInTheDocument();
  });

  it('shows an error when a change is refused', async () => {
    patchHandler = () =>
      Response.json(
        { success: false, error: { code: 'INVALID_TRANSITION', message: 'x' } },
        { status: 409 },
      );
    show(<KitchenDisplay />);
    await screen.findByRole('heading', { name: 'BBQ-cook2' });
    fireEvent.click(within(card('BBQ-cook2')).getByRole('button', { name: 'Start' }));
    expect(await screen.findByText(/Someone else already updated this order/)).toBeInTheDocument();
  });

  it('announces a new order', async () => {
    show(<KitchenDisplay />);
    await screen.findByRole('heading', { name: 'BBQ-cook1' });
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    FakeEventSource.last.send(
      31,
      { orderId: 'n', orderNumber: 'BBQ-n', status: 'RECEIVED', at: at(9) },
      'order.created',
    );
    expect(await screen.findByText('New order BBQ-n')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('New order BBQ-n')).toBeNull();
  });
});

describe('the store navigation', () => {
  it('marks the screen being shown', () => {
    show(<StoreNav />);
    expect(screen.getByRole('link', { name: 'Kitchen display' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Orders' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/store/orders');
  });
});
