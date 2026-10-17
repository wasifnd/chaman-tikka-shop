'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/shared/components/ui/Alert';
import { useAdminApi } from '../hooks/useAdminApi';
import type { AdminDeal } from '../types/admin.types';
import { formatAmount } from '../utils/format-amount';
import { DeleteButton } from './form-parts';

type Window = 'live' | 'scheduled' | 'ended' | 'off';

/** Where a deal stands right now, so the owner sees at a glance what customers can buy. */
export function dealState(deal: AdminDeal, now: Date): Window {
  if (!deal.isActive || !deal.isAvailable) return 'off';
  if (deal.startDate && new Date(deal.startDate) > now) return 'scheduled';
  if (deal.endDate && new Date(deal.endDate) <= now) return 'ended';
  return 'live';
}

export function DealsTable({ deals, now }: { deals: AdminDeal[]; now: string }) {
  const t = useTranslations('admin.deals');
  const common = useTranslations('admin.common');
  const api = useAdminApi();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function remove(deal: AdminDeal) {
    setError(null);
    setNotice(null);
    const result = await api('DELETE', `/api/v1/admin/deals/${deal.id}`);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    if ((result.data as { outcome?: string }).outcome === 'archived') {
      setNotice(t('archivedNotice', { name: deal.nameEn }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/admin/deals/new"
          className="bg-ember inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white hover:bg-orange-600"
        >
          {t('add')}
        </Link>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-200">
          {notice}
        </p>
      ) : null}
      {deals.length === 0 ? <p className="text-stone-400">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {deals.map((deal) => (
          <li
            key={deal.id}
            className="bg-ash flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800"
          >
            <div>
              <p className="font-semibold">{deal.nameEn}</p>
              <p className="text-sm text-stone-400">
                {formatAmount(deal.price)} · {t('itemCount', { count: deal.items.length })} ·{' '}
                {t(`state.${dealState(deal, new Date(now))}`)}
              </p>
            </div>
            <div className="flex gap-1">
              <Link
                href={`/admin/deals/${deal.id}`}
                aria-label={common('editLabel', { name: deal.nameEn })}
                className="bg-ash inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-stone-100 ring-1 ring-stone-700 hover:bg-stone-800"
              >
                {common('edit')}
              </Link>
              <DeleteButton
                label={common('deleteLabel', { name: deal.nameEn })}
                onConfirm={() => void remove(deal)}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
