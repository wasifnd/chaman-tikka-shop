// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '../testing/fake-event-source';
import type { StaffOrder, StaffOrdersResponse } from '../types/staff-order.types';
import { SOUND_STORAGE_KEY } from './useChime';
import { useStoreBoard } from './useStoreBoard';

const order = (id: string, status: StaffOrder['status'] = 'RECEIVED'): StaffOrder => ({
  id,
  orderNumber: `BBQ-${id}`,
  status,
  type: 'DELIVERY',
  createdAt: '2026-10-16T14:00:00.000Z',
  estimatedReadyAt: null,
  customerName: 'Ali',
  phone: '0300',
  address: null,
  instructions: null,
  items: [],
  subtotal: 0,
  couponDiscount: 0,
  deliveryCharge: 0,
  taxAmount: 0,
  grandTotal: 0,
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  cancelReason: null,
});

let notes = 0;
class FakeAudioContext {
  currentTime = 0;
  destination = {};
  state: AudioContextState = 'running';
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    return {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: () => {
        notes += 1;
      },
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
}

let server: { orders: StaffOrder[]; lastEventId: number };
let listCalls = 0;
let statusAnswer: () => Response;

const ok = (data: unknown) => Response.json({ success: true, data });

function install() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      if (input.startsWith('/api/v1/store/orders?')) {
        listCalls += 1;
        const body: StaffOrdersResponse = { ...server, serverTime: '2026-10-16T14:00:00.000Z' };
        return Promise.resolve(ok(body));
      }
      if (init?.method === 'PATCH') return Promise.resolve(statusAnswer());
      return Promise.resolve(new Response('{}', { status: 200 }));
    }),
  );
}

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  FakeEventSource.reset();
  listCalls = 0;
  notes = 0;
  server = { orders: [order('a'), order('b', 'PREPARING')], lastEventId: 20 };
  statusAnswer = () => ok({ result: {} });
  window.localStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal('EventSource', FakeEventSource);
  Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true });
  install();
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'AudioContext');
});

const loaded = async () => {
  const hook = renderHook(() => useStoreBoard(), { wrapper });
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
  return hook;
};

describe('loading', () => {
  it('shows the active orders and how many are waiting for acceptance', async () => {
    const { result } = await loaded();
    expect(result.current.orders.map((o) => o.id)).toEqual(['a', 'b']);
    expect(result.current.newCount).toBe(1);
    expect(result.current.signedOut).toBe(false);
    expect(result.current.loadFailed).toBe(false);
  });

  it('starts listening for live changes from the position the load reported', async () => {
    await loaded();
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    expect(FakeEventSource.last.url).toBe('/api/v1/store/events?after=20');
  });

  it('is loading, with no connection yet, before the first answer', () => {
    const { result } = renderHook(() => useStoreBoard(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('reports a failed load without pretending to be signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('x', { status: 500 }))),
    );
    const { result } = renderHook(() => useStoreBoard(), { wrapper });
    await waitFor(() => {
      expect(result.current.loadFailed).toBe(true);
    });
    expect(result.current.signedOut).toBe(false);
  });

  it('reports signed out when the login is gone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
    );
    const { result } = renderHook(() => useStoreBoard(), { wrapper });
    await waitFor(() => {
      expect(result.current.signedOut).toBe(true);
    });
    expect(result.current.loadFailed).toBe(false);
  });
});

describe('live changes', () => {
  const newOrderEvent = (id: number) => {
    FakeEventSource.last.send(
      id,
      { orderId: 'c', orderNumber: 'BBQ-c', status: 'RECEIVED', at: '2026-10-16T14:01:00.000Z' },
      'order.created',
    );
  };

  it('refreshes the list and flags the new order when one arrives', async () => {
    const { result } = await loaded();
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    server = { orders: [order('a'), order('b', 'PREPARING'), order('c')], lastEventId: 21 };
    const before = listCalls;

    act(() => {
      newOrderEvent(21);
    });
    expect(result.current.lastNew).toBe('BBQ-c');
    await waitFor(() => {
      expect(result.current.orders.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    });
    expect(listCalls).toBeGreaterThan(before);
    expect(result.current.newCount).toBe(2);
  });

  it('plays the chime for a new order when sound is on', async () => {
    window.localStorage.setItem(SOUND_STORAGE_KEY, '1');
    const { result } = await loaded();
    await act(async () => {
      await result.current.chime.enable();
    });
    notes = 0;
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    act(() => {
      newOrderEvent(21);
    });
    expect(notes).toBe(2);
  });

  it('stays silent for a new order when sound is off', async () => {
    await loaded();
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    act(() => {
      newOrderEvent(21);
    });
    expect(notes).toBe(0);
  });

  it('refreshes, without a chime or banner, when an order merely changes status', async () => {
    window.localStorage.setItem(SOUND_STORAGE_KEY, '1');
    const { result } = await loaded();
    await act(async () => {
      await result.current.chime.enable();
    });
    notes = 0;
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    server = { orders: [order('a', 'CONFIRMED'), order('b', 'PREPARING')], lastEventId: 21 };
    act(() => {
      FakeEventSource.last.send(21, {
        orderId: 'a',
        orderNumber: 'BBQ-a',
        status: 'CONFIRMED',
        at: '2026-10-16T14:01:00.000Z',
      });
    });
    await waitFor(() => {
      expect(result.current.orders[0]?.status).toBe('CONFIRMED');
    });
    expect(notes).toBe(0);
    expect(result.current.lastNew).toBeNull();
  });

  it('lets the banner be dismissed', async () => {
    const { result } = await loaded();
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    act(() => {
      newOrderEvent(21);
    });
    expect(result.current.lastNew).toBe('BBQ-c');
    act(() => {
      result.current.dismissLastNew();
    });
    expect(result.current.lastNew).toBeNull();
  });
});

describe('moving orders', () => {
  it('updates the screen instantly and tells the server', async () => {
    const { result } = await loaded();
    server = { orders: [order('a', 'CONFIRMED'), order('b', 'PREPARING')], lastEventId: 21 };
    act(() => {
      result.current.move({ orderId: 'a', to: 'CONFIRMED' });
    });
    await waitFor(() => {
      expect(result.current.orders.find((o) => o.id === 'a')?.status).toBe('CONFIRMED');
    });
    const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('/api/v1/store/orders/a/status');
    await waitFor(() => {
      expect(result.current.moving).toBe(false);
    });
  });

  it('puts the order back and explains when the server refuses', async () => {
    statusAnswer = () =>
      Response.json(
        {
          success: false,
          error: { code: 'INVALID_TRANSITION', message: 'Someone already moved it' },
        },
        { status: 409 },
      );
    const { result } = await loaded();
    act(() => {
      result.current.move({ orderId: 'a', to: 'CONFIRMED' });
    });
    await waitFor(() => {
      expect(result.current.moveError).not.toBeNull();
    });
    expect(result.current.moveError?.error.code).toBe('INVALID_TRANSITION');
    expect(result.current.orders.find((o) => o.id === 'a')?.status).toBe('RECEIVED');

    act(() => {
      result.current.dismissMoveError();
    });
    await waitFor(() => {
      expect(result.current.moveError).toBeNull();
    });
  });

  it('sends the reason when cancelling', async () => {
    const { result } = await loaded();
    act(() => {
      result.current.move({ orderId: 'a', to: 'CANCELLED', reason: 'Out of chicken' });
    });
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
    const body = patch?.[1]?.body;
    expect(JSON.parse(typeof body === 'string' ? body : '{}')).toEqual({
      status: 'CANCELLED',
      reason: 'Out of chicken',
    });
  });
});
