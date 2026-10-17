'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderStatus } from '@/features/orders/state-machine';
import { requestJson, type ApiError } from '@/shared/utils/api';
import { fetchWithRefresh } from '@/shared/utils/authed-fetch';
import { withStatus } from '../logic/board';
import type { StaffOrdersResponse } from '../types/staff-order.types';

export const STORE_ORDERS_KEY = ['store-orders'] as const;
const ACTIVE_KEY = [...STORE_ORDERS_KEY, 'active'] as const;

/** The login has expired and could not be renewed. */
export class SignedOutError extends Error {
  constructor() {
    super('Signed out');
    this.name = 'SignedOutError';
  }
}

/** A status change the server refused, carrying its reason. */
export class StatusChangeError extends Error {
  constructor(readonly error: ApiError) {
    super(error.message);
    this.name = 'StatusChangeError';
  }
}

export async function fetchStaffOrders(
  scope: 'active' | 'finished' = 'active',
  fetcher: typeof fetch = fetch,
): Promise<StaffOrdersResponse> {
  const response = await fetchWithRefresh(
    `/api/v1/store/orders?scope=${scope}`,
    { cache: 'no-store' },
    fetcher,
  );
  if (response.status === 401 || response.status === 403) throw new SignedOutError();
  if (!response.ok) throw new Error('Could not load orders');
  const body = (await response.json()) as { data?: StaffOrdersResponse };
  if (!body.data || !Array.isArray(body.data.orders)) throw new Error('Unexpected orders response');
  return body.data;
}

export function useStaffOrders(scope: 'active' | 'finished' = 'active') {
  return useQuery({
    queryKey: [...STORE_ORDERS_KEY, scope],
    queryFn: () => fetchStaffOrders(scope),
    // A safety net in case a live update is ever missed.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error instanceof SignedOutError) && count < 2,
  });
}

export interface StatusChange {
  orderId: string;
  to: OrderStatus;
  reason?: string | undefined;
}

export async function sendStatusChange(
  { orderId, to, reason }: StatusChange,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const result = await requestJson(
    'PATCH',
    `/api/v1/store/orders/${orderId}/status`,
    { status: to, ...(reason ? { reason } : {}) },
    (input, init) =>
      fetchWithRefresh(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        init,
        fetcher,
      ),
  );
  if (!result.ok) throw new StatusChangeError(result.error);
}

/**
 * Changes an order's status. The screen updates immediately and rolls back if the server refuses,
 * so buttons feel instant but the screen never keeps a change that didn't happen.
 */
export function useChangeStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: StatusChange) => sendStatusChange(change),
    onMutate: async ({ orderId, to }) => {
      await client.cancelQueries({ queryKey: ACTIVE_KEY });
      const previous = client.getQueryData<StaffOrdersResponse>(ACTIVE_KEY);
      if (previous) {
        client.setQueryData<StaffOrdersResponse>(ACTIVE_KEY, {
          ...previous,
          orders: withStatus(previous.orders, orderId, to),
        });
      }
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) client.setQueryData(ACTIVE_KEY, context.previous);
    },
    // Either way, ask the server for the truth.
    onSettled: () => client.invalidateQueries({ queryKey: STORE_ORDERS_KEY }),
  });
}
