'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { useAdminApi } from '../hooks/useAdminApi';
import type { AdminProductRow } from '../types/admin.types';
import { formatAmount } from '../utils/format-amount';
import { DeleteButton } from './form-parts';

export function ProductsTable({
  products,
  categories,
}: {
  products: AdminProductRow[];
  categories: { id: string; nameEn: string }[];
}) {
  const t = useTranslations('admin.products');
  const common = useTranslations('admin.common');
  const api = useAdminApi();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const shown = products.filter(
    (product) =>
      (categoryId === '' || product.categoryId === categoryId) &&
      product.nameEn.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function toggle(product: AdminProductRow) {
    setError(null);
    setNotice(null);
    setBusyId(product.id);
    const result = await api('PUT', `/api/v1/admin/products/${product.id}/availability`, {
      isAvailable: !product.isAvailable,
    });
    setBusyId(null);
    if (!result.ok) setError(result.error.message);
  }

  async function remove(product: AdminProductRow) {
    setError(null);
    setNotice(null);
    const result = await api('DELETE', `/api/v1/admin/products/${product.id}`);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const outcome = (result.data as { outcome?: string }).outcome;
    if (outcome === 'archived') setNotice(t('archivedNotice', { name: product.nameEn }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label={t('search')}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <Select
          label={t('category')}
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
          }}
        >
          <option value="">{t('allCategories')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nameEn}
            </option>
          ))}
        </Select>
        <Link
          href="/admin/menu/new"
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
      {shown.length === 0 ? <p className="text-stone-400">{t('empty')}</p> : null}

      <ul className="flex flex-col gap-3">
        {shown.map((product) => {
          const soldOut = !product.isAvailable || product.stockStatus === 'OUT_OF_STOCK';
          return (
            <li
              key={product.id}
              className="bg-ash flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <div>
                <p className="font-semibold">{product.nameEn}</p>
                <p className="text-sm text-stone-400">
                  {product.categoryName} ·{' '}
                  {product.discountPrice === null
                    ? formatAmount(product.basePrice)
                    : t('onSale', {
                        price: formatAmount(product.discountPrice),
                        was: formatAmount(product.basePrice),
                      })}
                  {product.isActive ? '' : ` · ${common('hidden')}`}
                  {soldOut ? ` · ${common('soldOut')}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="secondary"
                  disabled={busyId === product.id}
                  aria-label={
                    product.isAvailable
                      ? t('markSoldOutLabel', { name: product.nameEn })
                      : t('markAvailableLabel', { name: product.nameEn })
                  }
                  onClick={() => void toggle(product)}
                >
                  {product.isAvailable ? t('markSoldOut') : t('markAvailable')}
                </Button>
                <Link
                  href={`/admin/menu/${product.id}`}
                  aria-label={common('editLabel', { name: product.nameEn })}
                  className="bg-ash inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-stone-100 ring-1 ring-stone-700 hover:bg-stone-800"
                >
                  {common('edit')}
                </Link>
                <DeleteButton
                  label={common('deleteLabel', { name: product.nameEn })}
                  onConfirm={() => void remove(product)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
