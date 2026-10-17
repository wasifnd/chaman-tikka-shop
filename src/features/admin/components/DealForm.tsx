'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/shared/components/ui/Button';
import { Checkbox } from '@/shared/components/ui/Checkbox';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { Textarea } from '@/shared/components/ui/Textarea';
import { useAdminApi } from '../hooks/useAdminApi';
import {
  MAX_DEAL_ITEMS,
  dealInputSchema,
  type DealFormValues,
  type DealInput,
} from '../schemas/catalog.schema';
import type { AdminDeal, ProductPickerOption } from '../types/admin.types';
import { applyApiError } from '../utils/api-errors';
import { AdminForm, DateTimeField, ImageField } from './form-parts';

const BLANK: DealFormValues = {
  nameEn: '',
  descriptionEn: '',
  imageUrl: '',
  price: undefined as unknown as number,
  startDate: null,
  endDate: null,
  isAvailable: true,
  isActive: true,
  isFeatured: false,
  items: [],
};

export function DealForm({
  initial,
  products,
  uploadsEnabled,
}: {
  initial?: AdminDeal;
  products: ProductPickerOption[];
  uploadsEnabled: boolean;
}) {
  const t = useTranslations('admin.deals');
  const router = useRouter();
  const api = useAdminApi();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DealFormValues, unknown, DealInput>({
    resolver: zodResolver(dealInputSchema),
    defaultValues: initial
      ? {
          ...initial,
          items: initial.items.map(({ productId, variantId, quantity }) => ({
            productId,
            variantId,
            quantity,
          })),
        }
      : BLANK,
  });
  const items = useFieldArray({ control, name: 'items' });
  const watched = useWatch({ control, name: 'items' });

  async function onSubmit(values: DealInput) {
    setFormError(null);
    const result = initial
      ? await api('PATCH', `/api/v1/admin/deals/${initial.id}`, values)
      : await api('POST', '/api/v1/admin/deals', values);
    if (result.ok) router.push('/admin/deals');
    else setFormError(applyApiError(result.error, setError));
  }

  return (
    <AdminForm
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      formError={formError}
      saving={isSubmitting}
      onCancel={() => {
        router.push('/admin/deals');
      }}
    >
      <Input label={t('name')} error={errors.nameEn?.message} {...register('nameEn')} />
      <Textarea
        label={t('description')}
        error={errors.descriptionEn?.message}
        {...register('descriptionEn')}
      />
      <ImageField
        inputProps={register('imageUrl')}
        onUploaded={(url) => {
          setValue('imageUrl', url, { shouldDirty: true });
        }}
        uploadsEnabled={uploadsEnabled}
        error={errors.imageUrl?.message}
      />
      <Input
        label={t('price')}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        error={errors.price?.message}
        {...register('price', { valueAsNumber: true })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="startDate"
          render={({ field }) => (
            <DateTimeField
              label={t('starts')}
              value={field.value}
              onChange={field.onChange}
              error={errors.startDate?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="endDate"
          render={({ field }) => (
            <DateTimeField
              label={t('ends')}
              value={field.value}
              onChange={field.onChange}
              error={errors.endDate?.message}
            />
          )}
        />
      </div>
      <p className="text-xs text-stone-500">{t('datesHint')}</p>

      <div className="flex flex-wrap gap-x-6">
        <Checkbox label={t('available')} {...register('isAvailable')} />
        <Checkbox label={t('shownToCustomers')} {...register('isActive')} />
        <Checkbox label={t('featured')} {...register('isFeatured')} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-lg font-semibold">{t('contents')}</legend>
        {errors.items?.message ? (
          <p role="alert" className="text-sm text-red-400">
            {errors.items.message}
          </p>
        ) : null}
        {items.fields.map((field, index) => {
          const chosen = products.find((product) => product.id === watched[index]?.productId);
          return (
            <div
              key={field.id}
              className="flex flex-wrap items-end gap-3 rounded-lg bg-stone-900/60 p-3"
            >
              <Select
                label={t('product', { n: index + 1 })}
                error={errors.items?.[index]?.productId?.message}
                {...register(`items.${index}.productId`, {
                  // Picking another product clears the option, which belonged to the old one.
                  onChange: () => {
                    setValue(`items.${index}.variantId`, null);
                  },
                })}
              >
                <option value="">{t('chooseProduct')}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.nameEn}
                  </option>
                ))}
              </Select>
              {chosen && chosen.variants.length > 0 ? (
                <Select
                  label={t('option', { n: index + 1 })}
                  error={errors.items?.[index]?.variantId?.message}
                  {...register(`items.${index}.variantId`, {
                    setValueAs: (value: string) => (value === '' ? null : value),
                  })}
                >
                  <option value="">{t('anyOption')}</option>
                  {chosen.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.label}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Input
                label={t('quantity', { n: index + 1 })}
                type="number"
                min="1"
                error={errors.items?.[index]?.quantity?.message}
                {...register(`items.${index}.quantity`, { valueAsNumber: true })}
              />
              <Button
                variant="ghost"
                aria-label={t('removeItem', { n: index + 1 })}
                onClick={() => {
                  items.remove(index);
                }}
              >
                {t('remove')}
              </Button>
            </div>
          );
        })}
        <div>
          <Button
            variant="secondary"
            disabled={items.fields.length >= MAX_DEAL_ITEMS}
            onClick={() => {
              items.append({ productId: '', variantId: null, quantity: 1 });
            }}
          >
            {t('addItem')}
          </Button>
        </div>
      </fieldset>
    </AdminForm>
  );
}
