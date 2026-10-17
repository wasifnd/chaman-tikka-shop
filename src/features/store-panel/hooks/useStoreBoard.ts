'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { newOrderCount } from '../logic/board';
import type { StaffOrder } from '../types/staff-order.types';
import { useChime, type Chime } from './useChime';
import {
  STORE_ORDERS_KEY,
  SignedOutError,
  StatusChangeError,
  useChangeStatus,
  useStaffOrders,
  type StatusChange,
} from './useStoreOrders';
import { useStoreStream, type StreamStatus } from './useStoreStream';

export interface StoreBoard {
  orders: StaffOrder[];
  /** The server's clock from the latest load, so ages and urgency are computed against it. */
  serverTime: string | null;
  newCount: number;
  isLoading: boolean;
  loadFailed: boolean;
  signedOut: boolean;
  /** Tries the first load again after a failure. */
  reload: () => void;
  connection: StreamStatus;
  chime: Chime;
  /** Order number of the newest arrival, for a "new order" banner. */
  lastNew: string | null;
  dismissLastNew: () => void;
  move: (change: StatusChange) => void;
  moving: boolean;
  /** The order currently being saved, so only its buttons are locked and others stay usable. */
  movingOrderId: string | null;
  /** The server's reason when a status change was refused. */
  moveError: StatusChangeError | null;
  dismissMoveError: () => void;
}

/**
 * Everything a store screen needs: the live list of active orders, a connection that keeps it
 * current, the new-order chime, and status changes with instant feedback.
 */
export function useStoreBoard(): StoreBoard {
  const client = useQueryClient();
  const orders = useStaffOrders('active');
  const chime = useChime();
  const change = useChangeStatus();
  const [lastNew, setLastNew] = useState<string | null>(null);

  const connection = useStoreStream({
    afterId: orders.data?.lastEventId ?? null,
    onEvent: (_id, payload) => {
      void client.invalidateQueries({ queryKey: STORE_ORDERS_KEY });
      if (payload.type === 'order.created') {
        chime.play();
        setLastNew(payload.orderNumber);
      }
    },
  });

  const list = orders.data?.orders ?? [];
  const failure = change.error;

  return {
    orders: list,
    serverTime: orders.data?.serverTime ?? null,
    newCount: newOrderCount(list),
    isLoading: orders.isPending,
    loadFailed: orders.isError && !(orders.error instanceof SignedOutError),
    signedOut: orders.error instanceof SignedOutError || connection === 'signedOut',
    reload: () => {
      void orders.refetch();
    },
    connection,
    chime,
    lastNew,
    dismissLastNew: () => {
      setLastNew(null);
    },
    move: (request) => {
      change.mutate(request);
    },
    moving: change.isPending,
    movingOrderId: change.isPending ? change.variables.orderId : null,
    moveError: failure instanceof StatusChangeError ? failure : null,
    dismissMoveError: () => {
      change.reset();
    },
  };
}
