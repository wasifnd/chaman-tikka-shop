'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Checkbox } from '@/shared/components/ui/Checkbox';
import { Input } from '@/shared/components/ui/Input';
import { useAdminApi } from '../hooks/useAdminApi';
import {
  settingsUpdateSchema,
  type SettingsFormValues,
  type SettingsUpdate,
} from '../schemas/operations.schema';
import type { AdminSettings } from '../types/admin.types';
import { applyApiError } from '../utils/api-errors';
import { AdminForm } from './form-parts';

export function SettingsForm({ initial }: { initial: AdminSettings }) {
  const t = useTranslations('admin.settings');
  const api = useAdminApi();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues, unknown, SettingsUpdate>({
    resolver: zodResolver(settingsUpdateSchema),
    defaultValues: initial,
  });
  const hours = useWatch({ control, name: 'hours' });
  const ordering = useWatch({ control, name: 'restaurant.orderingEnabled' });

  async function onSubmit(values: SettingsUpdate) {
    setFormError(null);
    setSaved(false);
    const result = await api('PUT', '/api/v1/admin/settings', values);
    if (result.ok) setSaved(true);
    else setFormError(applyApiError(result.error, setError));
  }

  return (
    <AdminForm
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      formError={formError}
      saving={isSubmitting}
    >
      {saved ? (
        <p role="status" className="rounded-lg bg-green-950 px-3 py-2 text-sm text-green-200">
          {t('saved')}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">{t('restaurant')}</legend>
        <Input
          label={t('name')}
          error={errors.restaurant?.name?.message}
          {...register('restaurant.name')}
        />
        <Input
          label={t('address')}
          error={errors.restaurant?.address?.message}
          {...register('restaurant.address')}
        />
        <Input
          label={t('tax')}
          type="number"
          step="0.01"
          min="0"
          max="30"
          inputMode="decimal"
          error={errors.restaurant?.taxRatePercent?.message}
          {...register('restaurant.taxRatePercent', { valueAsNumber: true })}
        />
        <Checkbox label={t('orderingEnabled')} {...register('restaurant.orderingEnabled')} />
        {ordering ? null : (
          <p role="status" className="rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-200">
            {t('orderingOffWarning')}
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t('hours')}</legend>
        <p className="text-sm text-stone-400">{t('hoursHint')}</p>
        {initial.hours.map((day, index) => {
          const closed = hours[index]?.isClosed ?? day.isClosed;
          return (
            <div
              key={day.dayOfWeek}
              className="flex flex-wrap items-end gap-3 rounded-lg bg-stone-900/60 p-3"
            >
              <p className="w-24 pb-3 font-medium">{t(`days.${String(day.dayOfWeek)}`)}</p>
              <Checkbox label={t('closed')} {...register(`hours.${index}.isClosed`)} />
              <Input
                label={t('opens', { day: t(`days.${String(day.dayOfWeek)}`) })}
                type="time"
                disabled={closed}
                error={errors.hours?.[index]?.openTime?.message}
                {...register(`hours.${index}.openTime`)}
              />
              <Input
                label={t('closes', { day: t(`days.${String(day.dayOfWeek)}`) })}
                type="time"
                disabled={closed}
                error={errors.hours?.[index]?.closeTime?.message}
                {...register(`hours.${index}.closeTime`)}
              />
            </div>
          );
        })}
        {errors.hours?.message ? (
          <p role="alert" className="text-sm text-red-400">
            {errors.hours.message}
          </p>
        ) : null}
      </fieldset>
    </AdminForm>
  );
}
