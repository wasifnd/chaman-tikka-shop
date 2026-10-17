'use client';

import { useTranslations } from 'next-intl';
import { useNow } from '@/features/orders/tracking/useNow';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { cn } from '@/shared/utils/cn';
import {
  actionsFor,
  ageMinutes,
  formatAge,
  kitchenTickets,
  urgencyFor,
  type Urgency,
} from '../logic/board';
import { useStoreBoard, type StoreBoard } from '../hooks/useStoreBoard';
import type { StaffOrder } from '../types/staff-order.types';
import { StoreStatusBar } from './StoreStatusBar';
import {
  LoadFailedNotice,
  MoveErrorBanner,
  NewOrderBanner,
  SignedOutNotice,
} from './store-messages';
import { useWaitingTitle } from './StoreBoard';

const URGENCY_STYLE: Record<Urgency, string> = {
  ok: 'ring-green-700',
  warn: 'ring-amber-500',
  late: 'ring-red-500',
};

/**
 * The screen mounted in the kitchen: only what has to be cooked, big and readable from a distance,
 * oldest first, with one big button per ticket. Contact details and prices are left off.
 */
export function KitchenDisplay() {
  const board = useStoreBoard();

  if (board.signedOut) return <SignedOutNotice />;
  if (board.loadFailed) return <LoadFailedNotice onRetry={board.reload} />;
  if (board.isLoading || board.serverTime === null) {
    return (
      <div aria-busy="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  return <KitchenContent board={board} serverTime={board.serverTime} />;
}

function KitchenContent({ board, serverTime }: { board: StoreBoard; serverTime: string }) {
  const t = useTranslations('store');
  const nowMs = useNow(serverTime, 15_000);
  const tickets = kitchenTickets(board.orders);
  useWaitingTitle(board.newCount, t('kitchenTitle'));

  return (
    <div className="flex flex-col gap-4">
      <StoreStatusBar connection={board.connection} chime={board.chime} />
      {board.lastNew ? (
        <NewOrderBanner number={board.lastNew} onDismiss={board.dismissLastNew} />
      ) : null}
      {board.moveError ? (
        <MoveErrorBanner error={board.moveError} onDismiss={board.dismissMoveError} />
      ) : null}

      {tickets.length === 0 ? (
        <p className="py-12 text-center text-2xl text-stone-500">{t('kitchenEmpty')}</p>
      ) : (
        <ul className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tickets.map((order) => (
            <Ticket
              key={order.id}
              order={order}
              nowMs={nowMs}
              busy={board.movingOrderId === order.id}
              onMove={(to) => {
                board.move({ orderId: order.id, to });
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Ticket({
  order,
  nowMs,
  busy,
  onMove,
}: {
  order: StaffOrder;
  nowMs: number;
  busy: boolean;
  onMove: (to: StaffOrder['status']) => void;
}) {
  const t = useTranslations('store');
  const urgency = urgencyFor(order, nowMs);
  // The kitchen only moves food forward; cancelling is done on the orders screen.
  const next = actionsFor(order).find((action) => action.tone === 'primary');

  return (
    <li
      data-urgency={urgency}
      className={cn('bg-ash/70 flex flex-col gap-3 rounded-xl p-5 ring-4', URGENCY_STYLE[urgency])}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-3xl font-bold">{order.orderNumber}</h3>
        <p className="text-xl">{formatAge(ageMinutes(order, nowMs))}</p>
      </div>
      <p className="text-lg text-stone-300">{t(`type.${order.type}`)}</p>

      <ul className="flex flex-col gap-2">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${String(index)}`} className="text-2xl">
            <span className="font-bold">
              {item.quantity} × {item.name}
            </span>
            {item.options.length > 0 ? (
              <span className="block text-lg text-stone-300">{item.options.join(', ')}</span>
            ) : null}
            {item.note ? (
              <span className="block text-lg text-amber-300">
                {t('itemNote', { note: item.note })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {order.instructions ? (
        <p className="rounded-lg bg-amber-950 px-3 py-2 text-lg text-amber-200">
          {order.instructions}
        </p>
      ) : null}

      {next ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            onMove(next.to);
          }}
          className="bg-ember focus-visible:outline-ember min-h-16 rounded-xl text-2xl font-bold text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {t(
            `kitchenActions.${next.to === 'PREPARING' ? 'PREPARING' : next.to === 'READY' ? 'READY' : 'CONFIRMED'}`,
          )}
        </button>
      ) : null}
    </li>
  );
}
