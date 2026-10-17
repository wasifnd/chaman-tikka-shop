'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/shared/components/ui/Button';
import { Checkbox } from '@/shared/components/ui/Checkbox';
import { Input } from '@/shared/components/ui/Input';
import { useAdminApi } from '../hooks/useAdminApi';
import { addonInputSchema, type AddonFormValues, type AddonInput } from '../schemas/catalog.schema';
import type { AdminAddon } from '../types/admin.types';
import { applyApiError } from '../utils/api-errors';
import { formatAmount } from '../utils/format-amount';
import { AdminForm, DeleteButton } from './form-parts';

function AddonForm({ initial, onDone }: { initial?: AdminAddon; onDone: () => void }) {
  const t = useTranslations('admin.addons');
  const api = useAdminApi();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddonFormValues, unknown, AddonInput>({
    resolver: zodResolver(addonInputSchema),
    defaultValues: initial
      ? { nameEn: initial.nameEn, price: initial.price, isAvailable: initial.isAvailable }
      : { nameEn: '', price: 0, isAvailable: true },
  });

  async function onSubmit(values: AddonInput) {
    setFormError(null);
    const result = initial
      ? await api('PATCH', `/api/v1/admin/addons/${initial.id}`, values)
      : await api('POST', '/api/v1/admin/addons', values);
    if (result.ok) onDone();
    else setFormError(applyApiError(result.error, setError));
  }

  return (
    <AdminForm
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      formError={formError}
      saving={isSubmitting}
      onCancel={onDone}
    >
      <Input label={t('name')} error={errors.nameEn?.message} {...register('nameEn')} />
      <Input
        label={t('price')}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        error={errors.price?.message}
        {...register('price', { valueAsNumber: true })}
      />
      <Checkbox label={t('available')} {...register('isAvailable')} />
    </AdminForm>
  );
}

export function AddonsManager({ addons }: { addons: AdminAddon[] }) {
  const t = useTranslations('admin.addons');
  const common = useTranslations('admin.common');
  const api = useAdminApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(addon: AdminAddon) {
    setError(null);
    const result = await api('DELETE', `/api/v1/admin/addons/${addon.id}`);
    if (!result.ok) setError(result.error.message);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-400">{t('intro')}</p>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {editing === 'new' ? (
        <AddonForm
          onDone={() => {
            setEditing(null);
          }}
        />
      ) : (
        <div>
          <Button
            onClick={() => {
              setEditing('new');
            }}
          >
            {t('add')}
          </Button>
        </div>
      )}
      {addons.length === 0 ? <p className="text-stone-400">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {addons.map((addon) =>
          editing === addon.id ? (
            <li key={addon.id}>
              <AddonForm
                initial={addon}
                onDone={() => {
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li
              key={addon.id}
              className="bg-ash flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <div>
                <p className="font-semibold">
                  {addon.nameEn} · {formatAmount(addon.price)}
                </p>
                <p className="text-sm text-stone-400">
                  {t('usedBy', { count: addon.productCount })}
                  {addon.isAvailable ? '' : ` · ${common('unavailable')}`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  aria-label={common('editLabel', { name: addon.nameEn })}
                  onClick={() => {
                    setEditing(addon.id);
                  }}
                >
                  {common('edit')}
                </Button>
                <DeleteButton
                  label={common('deleteLabel', { name: addon.nameEn })}
                  onConfirm={() => void remove(addon)}
                />
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
