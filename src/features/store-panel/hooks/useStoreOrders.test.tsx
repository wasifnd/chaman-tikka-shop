// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffOrder, StaffOrdersResponse } from '../types/staff-order.types';
import {
  STORE_ORDERS_KEY,
  SignedOutError,
  StatusChangeError,
  fetchStaffOrders,
  sendStatusChange,
  useChangeStatus,
  useStaffOrders,
} from './useStoreOrders';

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

const payload = (orders: StaffOrder[], lastEventId = 5): StaffOrdersResponse => ({
  orders,
  lastEventId,
  serverTime: '2026-10-16T14:00:00.000Z',
});
const ok = (body: unknown) => Response.json({ success: true, data: body });
const error = (code: string, status: number, message = code) =>
  Response.json({ success: false, error: { code, message } }, { status });

describe('fetchStaffOrders', () => {
  it('returns the orders and the live-stream position', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(ok(payload([order('a')], 9))));
    const result = await fetchStaffOrders('active', fetcher);
    expect(result.orders).toHaveLength(1);
    expect(result.lastEventId).toBe(9);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/store/orders?scope=active');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('asks for finished orders when told to', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(ok(payload([]))));
    await fetchStaffOrders('finished', fetcher);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/store/orders?scope=finished');
  });

  it('reports signed out when the login cannot be renewed', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 401 })));
    await expect(fetchStaffOrders('active', fetcher)).rejects.toBeInstanceOf(SignedOutError);
  });

  it('reports signed out for a non-staff account too', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 403 })));
    await expect(fetchStaffOrders('active', fetcher)).rejects.toBeInstanceOf(SignedOutError);
  });

  it('renews an expired login and tries again before giving up', async () => {
    const answers = [
      new Response('{}', { status: 401 }),
      new Response('{}', { status: 200 }),
      ok(payload([order('a')])),
    ];
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(answers.shift() ?? new Response('', { status: 500 })),
    );
    const result = await fetchStaffOrders('active', fetcher);
    expect(result.orders).toHaveLength(1);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/store/orders?scope=active',
      '/api/auth/refresh',
      '/api/v1/store/orders?scope=active',
    ]);
  });

  it('fails on server errors and malformed responses', async () => {
    await expect(
      fetchStaffOrders(
        'active',
        vi.fn<typeof fetch>(() => Promise.resolve(new Response('x', { status: 500 }))),
      ),
    ).rejects.toThrow('Could not load orders');
    await expect(
      fetchStaffOrders(
        'active',
        vi.fn<typeof fetch>(() => Promise.resolve(ok({ nope: true }))),
      ),
    ).rejects.toThrow('Unexpected orders response');
    await expect(
      fetchStaffOrders(
        'active',
        vi.fn<typeof fetch>(() => Promise.resolve(ok({ orders: 'x' }))),
      ),
    ).rejects.toThrow('Unexpected orders response');
  });
});

describe('sendStatusChange', () => {
  it('sends the new status and the cancellation reason to the right order', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(ok({ result: {} })));
    await sendStatusChange({ orderId: 'o1', to: 'CANCELLED', reason: 'Out of chicken' }, fetcher);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/store/orders/o1/status');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '{}')).toEqual({
      status: 'CANCELLED',
      reason: 'Out of chicken',
    });
  });

  it('omits the reason when there is none', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(ok({ result: {} })));
    await sendStatusChange({ orderId: 'o1', to: 'CONFIRMED' }, fetcher);
    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(JSON.parse(typeof body === 'string' ? body : '{}')).toEqual({ status: 'CONFIRMED' });
  });

  it("throws the server's reason when the change is refused", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(error('INVALID_TRANSITION', 409, 'Already moved')),
    );
    const failure = await sendStatusChange({ orderId: 'o1', to: 'READY' }, fetcher).then(
      () => null,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(StatusChangeError);
    expect((failure as StatusChangeError).error).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: 'Already moved',
    });
  });

  it('renews an expired login and retries the change', async () => {
    const answers = [
      new Response('{}', { status: 401 }),
      new Response('{}', { status: 200 }),
      ok({ result: {} }),
    ];
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(answers.shift() ?? new Response('', { status: 500 })),
    );
    await expect(
      sendStatusChange({ orderId: 'o1', to: 'CONFIRMED' }, fetcher),
    ).resolves.toBeUndefined();
    expect(fetcher.mock.calls.map(([url]) => url)).toContain('/api/auth/refresh');
  });
});

describe('hooks', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const KEY = [...STORE_ORDERS_KEY, 'active'];

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('useStaffOrders', () => {
    it('loads the active orders', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(ok(payload([order('a'), order('b')])))),
      );
      const { result } = renderHook(() => useStaffOrders(), { wrapper });
      await waitFor(() => {
        expect(result.current.data?.orders).toHaveLength(2);
      });
    });

    it('surfaces a signed-out state', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
      );
      const { result } = renderHook(() => useStaffOrders(), { wrapper });
      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(SignedOutError);
      });
    });
  });

  describe('useChangeStatus', () => {
    const seed = () =>
      client.setQueryData<StaffOrdersResponse>(KEY, payload([order('a'), order('b')]));
    const statuses = () =>
      client.getQueryData<StaffOrdersResponse>(KEY)?.orders.map((o) => `${o.id}:${o.status}`);

    it('updates the screen immediately, before the server answers', async () => {
      seed();
      let release: () => void = () => undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          url.endsWith('/status')
            ? new Promise<Response>((resolve) => {
                release = () => {
                  resolve(ok({ result: {} }));
                };
              })
            : Promise.resolve(ok(payload([order('a', 'CONFIRMED'), order('b')]))),
        ),
      );
      const { result } = renderHook(() => useChangeStatus(), { wrapper });
      act(() => {
        result.current.mutate({ orderId: 'a', to: 'CONFIRMED' });
      });
      await waitFor(() => {
        expect(statuses()).toEqual(['a:CONFIRMED', 'b:RECEIVED']);
      });
      expect(result.current.isPending).toBe(true);
      act(() => {
        release();
      });
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('takes a finished order off the active list at once', async () => {
      seed();
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>(() => undefined)),
      );
      const { result } = renderHook(() => useChangeStatus(), { wrapper });
      act(() => {
        result.current.mutate({ orderId: 'a', to: 'CANCELLED', reason: 'x' });
      });
      await waitFor(() => {
        expect(statuses()).toEqual(['b:RECEIVED']);
      });
    });

    it('puts everything back if the server refuses, and exposes why', async () => {
      seed();
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          Promise.resolve(
            url.endsWith('/status')
              ? error('INVALID_TRANSITION', 409, 'Someone already moved this order')
              : ok(payload([order('a'), order('b')])),
          ),
        ),
      );
      const { result } = renderHook(() => useChangeStatus(), { wrapper });
      act(() => {
        result.current.mutate({ orderId: 'a', to: 'CONFIRMED' });
      });
      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
      expect(result.current.error).toBeInstanceOf(StatusChangeError);
      expect(statuses()).toEqual(['a:RECEIVED', 'b:RECEIVED']);
    });

    it('refreshes from the server afterwards, whatever happened', async () => {
      seed();
      const fetchMock = vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('/status')
            ? ok({ result: {} })
            : ok(payload([order('a', 'PREPARING'), order('b')], 8)),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => useChangeStatus(), { wrapper });
      // The list screen is mounted, so invalidation triggers a real refetch.
      renderHook(() => useStaffOrders(), { wrapper });
      await waitFor(() => {
        expect(client.getQueryData<StaffOrdersResponse>(KEY)?.lastEventId).toBeDefined();
      });
      act(() => {
        result.current.mutate({ orderId: 'a', to: 'CONFIRMED' });
      });
      await waitFor(() => {
        expect(statuses()).toEqual(['a:PREPARING', 'b:RECEIVED']);
      });
    });
  });
});
