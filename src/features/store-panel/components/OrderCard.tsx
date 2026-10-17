'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Textarea } from '@/shared/components/ui/Textarea';
import { cn } from '@/shared/utils/cn';
import { formatPrice } from '@/shared/utils/format';
import {
  actionsFor,
  ageMinutes,
  formatAge,
  urgencyFor,
  type OrderAction,
  type Urgency,
} from '../logic/board';
import { MAX_REASON_LENGTH } from '../schemas/transition.schema';
import type { StaffOrder } from '../types/staff-order.types';

const timeFormat = new Intl.DateTimeFormat('en-PK', {
  timeStyle: 'short',
  timeZone: 'Asia/Karachi',
});

const URGENCY_STYLE: Record<Urgency, string> = {
  ok: 'ring-stone-800',
  warn: 'ring-amber-500',
  late: 'ring-red-500',
};

interface OrderCardProps {
  order: StaffOrder;
  nowMs: number;
  /** Disables the buttons while a change is in flight. */
  busy: boolean;
  onAction: (action: OrderAction, reason?: string) => void;
}

export function OrderCard({ order, nowMs, busy, onAction }: OrderCardProps) {
  const t = useTranslations('store');
  const [cancelling, setCancelling] = useState<OrderAction | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);

  const urgency = urgencyFor(order, nowMs);
  const actions = actionsFor(order);
  const finished = order.status === 'COMPLETED' || order.status === 'CANCELLED';

  function confirmCancel() {
    if (!cancelling) return;
    if (reason.trim() === '') {
      setReasonError(true);
      return;
    }
    onAction(cancelling, reason.trim());
    setCancelling(null);
    setReason('');
    setReasonError(false);
  }

  return (
    <li
      data-urgency={urgency}
      className={cn('bg-ash/70 flex flex-col gap-3 rounded-xl p-4 ring-2', URGENCY_STYLE[urgency])}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">{order.orderNumber}</h3>
          <p className="text-sm text-stone-400">
            {t(`type.${order.type}`)} · {t('waiting', { age: formatAge(ageMinutes(order, nowMs)) })}
          </p>
        </div>
        {order.estimatedReadyAt && !finished ? (
          <p className="text-right text-sm text-stone-300">
            {t('readyBy', { time: timeFormat.format(new Date(order.estimatedReadyAt)) })}
          </p>
        ) : null}
      </div>

      <div className="text-sm">
        <p className="font-medium">{order.customerName}</p>
        {order.phone ? (
          <a
            href={`tel:${order.phone}`}
            aria-label={t('callCustomer', { name: order.customerName })}
            className="text-ember underline"
          >
            {order.phone}
          </a>
        ) : null}
        {order.address ? (
          <p className="mt-1 text-stone-300">
            <span className="text-stone-400">{t('deliverTo')}: </span>
            {order.address.line1}
            {order.address.line2 ? `, ${order.address.line2}` : ''}, {order.address.area}
          </p>
        ) : null}
      </div>

      <ul className="flex flex-col gap-1.5">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${String(index)}`}>
            <span className="font-semibold">
              {item.quantity} × {item.name}
            </span>
            {item.options.length > 0 ? (
              <span className="block text-sm text-stone-400">{item.options.join(', ')}</span>
            ) : null}
            {item.note ? (
              <span className="block text-sm text-amber-300">
                {t('itemNote', { note: item.note })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {order.instructions ? (
        <p className="rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-200">
          <span className="font-semibold">{t('notes')}: </span>
          {order.instructions}
        </p>
      ) : null}

      <p className="text-sm text-stone-300">
        {order.paymentStatus === 'PAID'
          ? t('paid')
          : t('collect', { amount: formatPrice(order.grandTotal) })}
      </p>

      {order.status === 'CANCELLED' ? (
        <p className="text-sm text-red-300">
          {order.cancelReason
            ? t('cancelled', { reason: order.cancelReason })
            : t('cancelledNoReason')}
        </p>
      ) : null}

      {cancelling ? (
        <div className="flex flex-col gap-2">
          <Textarea
            label={t('reasonLabel')}
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            error={reasonError ? t('reasonRequired') : undefined}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(false);
            }}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 bg-red-900 hover:bg-red-800"
              disabled={busy}
              onClick={confirmCancel}
            >
              {t('confirm')}
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setCancelling(null);
                setReason('');
                setReasonError(false);
              }}
            >
              {t('keepOrder')}
            </Button>
          </div>
        </div>
      ) : actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.to}
              variant={action.tone === 'danger' ? 'secondary' : 'primary'}
              className={cn('flex-1', action.tone === 'danger' && 'text-red-300')}
              disabled={busy}
              onClick={() => {
                if (action.needsReason) setCancelling(action);
                else onAction(action);
              }}
            >
              {t(`actions.${action.label}`)}
            </Button>
          ))}
        </div>
      ) : null}
    </li>
  );
}
