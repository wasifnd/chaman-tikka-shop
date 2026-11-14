'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useNow } from '@/features/orders/tracking/useNow';
import { BoardColumnSkeleton } from '@/shared/components/ui/PageLoading';
import { Spinner } from '@/shared/components/ui/Spinner';
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
    return <BoardLoading />;
  }
  return <BoardContent board={board} serverTime={board.serverTime} />;
}

/** While the orders load: the board's own columns, with order-shaped placeholders. */
function BoardLoading() {
  const t = useTranslations('loading');
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p role="status" className="text-gold flex items-center gap-2 text-sm">
        <Spinner />
        {t('orders')}
      </p>
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column, index) => (
          <BoardColumnSkeleton key={column.id} cards={index === 0 ? 2 : 1} />
        ))}
      </div>
    </div>
  );
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
            className="bg-char/40 flex flex-col gap-3 rounded-2xl p-3 ring-1 ring-stone-800"
          >
            <h2
              id={`column-${column.id}`}
              className="flex items-center justify-between border-b border-stone-800 px-1 pb-2 font-semibold"
            >
              {t(`columns.${column.id}`)}
              <span className="bg-ash min-w-8 rounded-full px-2 py-0.5 text-center text-sm text-stone-200 ring-1 ring-stone-700">
                {grouped[column.id].length}
              </span>
            </h2>
            {grouped[column.id].length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-800 p-4 text-sm text-stone-500">
                {t('emptyColumn')}
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
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
