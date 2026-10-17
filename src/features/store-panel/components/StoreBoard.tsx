'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useNow } from '@/features/orders/tracking/useNow';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { COLUMNS, groupOrders } from '../logic/board';
import { useStoreBoard, type StoreBoard as BoardState } from '../hooks/useStoreBoard';
import { FinishedOrders } from './FinishedOrders';
import { OrderCard } from './OrderCard';
import { StoreStatusBar } from './StoreStatusBar';
import {
  LoadFailedNotice,
  MoveErrorBanner,
  NewOrderBanner,
  SignedOutNotice,
} from './store-messages';

/** Shows "(3) ..." in the tab title so a waiting order is noticed even from another tab. */
export function useWaitingTitle(count: number, base: string) {
  useEffect(() => {
    document.title = count > 0 ? `(${String(count)}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [count, base]);
}

export function StoreBoard() {
  const board = useStoreBoard();

  if (board.signedOut) return <SignedOutNotice />;
  if (board.loadFailed) return <LoadFailedNotice onRetry={board.reload} />;
  if (board.isLoading || board.serverTime === null) {
    return (
      <div aria-busy="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => (
          <Skeleton key={column.id} className="h-64" />
        ))}
      </div>
    );
  }
  return <BoardContent board={board} serverTime={board.serverTime} />;
}

function BoardContent({ board, serverTime }: { board: BoardState; serverTime: string }) {
  const t = useTranslations('store');
  // The clock starts from the server's time, so ages are right even if this device's clock is off.
  const nowMs = useNow(serverTime, 15_000);
  const grouped = groupOrders(board.orders);
  useWaitingTitle(board.newCount, t('title'));

  return (
    <div className="flex flex-col gap-4">
      <StoreStatusBar connection={board.connection} chime={board.chime} />

      {board.lastNew ? (
        <NewOrderBanner number={board.lastNew} onDismiss={board.dismissLastNew} />
      ) : null}
      {board.moveError ? (
        <MoveErrorBanner error={board.moveError} onDismiss={board.dismissMoveError} />
      ) : null}

      {board.orders.length === 0 ? <p className="py-8 text-stone-400">{t('noOrders')}</p> : null}

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => (
          <section
            key={column.id}
            aria-labelledby={`column-${column.id}`}
            className="flex flex-col gap-3"
          >
            <h2
              id={`column-${column.id}`}
              className="flex items-baseline justify-between font-semibold"
            >
              {t(`columns.${column.id}`)}
              <span className="text-sm text-stone-400">{grouped[column.id].length}</span>
            </h2>
            {grouped[column.id].length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-800 p-4 text-sm text-stone-500">
                {t('emptyColumn')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {grouped[column.id].map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    nowMs={nowMs}
                    busy={board.movingOrderId === order.id}
                    onAction={(action, reason) => {
                      board.move({ orderId: order.id, to: action.to, reason });
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <FinishedOrders />
    </div>
  );
}
