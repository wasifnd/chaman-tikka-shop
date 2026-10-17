'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/shared/components/ui/Button';
import { Checkbox } from '@/shared/components/ui/Checkbox';
import { Input } from '@/shared/components/ui/Input';
import { useAdminApi } from '../hooks/useAdminApi';
import { zoneInputSchema, type ZoneFormValues, type ZoneInput } from '../schemas/operations.schema';
import type { AdminZone } from '../types/admin.types';
import { applyApiError } from '../utils/api-errors';
import { formatAmount } from '../utils/format-amount';
import { AdminForm, DeleteButton } from './form-parts';

const BLANK: ZoneFormValues = {
  name: '',
  charge: 0,
  freeDeliveryAbove: undefined,
  minOrderAmount: 0,
  isActive: true,
  sortOrder: 0,
};

function ZoneForm({ initial, onDone }: { initial?: AdminZone; onDone: () => void }) {
  const t = useTranslations('admin.zones');
  const api = useAdminApi();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ZoneFormValues, unknown, ZoneInput>({
    resolver: zodResolver(zoneInputSchema),
    defaultValues: initial
      ? { ...initial, freeDeliveryAbove: initial.freeDeliveryAbove ?? undefined }
      : BLANK,
  });

  async function onSubmit(values: ZoneInput) {
    setFormError(null);
    const result = initial
      ? await api('PATCH', `/api/v1/admin/zones/${initial.id}`, values)
      : await api('POST', '/api/v1/admin/zones', values);
    if (result.ok) onDone();
    else setFormError(applyApiError(result.error, setError));
  }

  const money = { type: 'number', step: '0.01', min: '0', inputMode: 'decimal' } as const;
  return (
    <AdminForm
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      formError={formError}
      saving={isSubmitting}
      onCancel={onDone}
    >
      <Input label={t('name')} error={errors.name?.message} {...register('name')} />
      <Input
        label={t('charge')}
        error={errors.charge?.message}
        {...money}
        {...register('charge', { valueAsNumber: true })}
      />
      <Input
        label={t('freeAbove')}
        error={errors.freeDeliveryAbove?.message}
        {...money}
        {...register('freeDeliveryAbove', { valueAsNumber: true })}
      />
      <Input
        label={t('minOrder')}
        error={errors.minOrderAmount?.message}
        {...money}
        {...register('minOrderAmount', { valueAsNumber: true })}
      />
      <Input
        label={t('sortOrder')}
        type="number"
        error={errors.sortOrder?.message}
        {...register('sortOrder', { valueAsNumber: true })}
      />
      <Checkbox label={t('active')} {...register('isActive')} />
    </AdminForm>
  );
}

export function ZonesManager({ zones }: { zones: AdminZone[] }) {
  const t = useTranslations('admin.zones');
  const common = useTranslations('admin.common');
  const api = useAdminApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(zone: AdminZone) {
    setError(null);
    const result = await api('DELETE', `/api/v1/admin/zones/${zone.id}`);
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
        <ZoneForm
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
      {zones.length === 0 ? <p className="text-stone-400">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {zones.map((zone) =>
          editing === zone.id ? (
            <li key={zone.id}>
              <ZoneForm
                initial={zone}
                onDone={() => {
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li
              key={zone.id}
              className="bg-ash flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <div>
                <p className="font-semibold">{zone.name}</p>
                <p className="text-sm text-stone-400">
                  {zone.charge === 0
                    ? t('free')
                    : t('chargeIs', { amount: formatAmount(zone.charge) })}
                  {zone.freeDeliveryAbove === null
                    ? ''
                    : ` · ${t('freeAboveIs', { amount: formatAmount(zone.freeDeliveryAbove) })}`}
                  {zone.minOrderAmount > 0
                    ? ` · ${t('minOrderIs', { amount: formatAmount(zone.minOrderAmount) })}`
                    : ''}
                  {zone.isActive ? '' : ` · ${common('hidden')}`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  aria-label={common('editLabel', { name: zone.name })}
                  onClick={() => {
                    setEditing(zone.id);
                  }}
                >
                  {common('edit')}
                </Button>
                <DeleteButton
                  label={common('deleteLabel', { name: zone.name })}
                  onConfirm={() => void remove(zone)}
                />
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
