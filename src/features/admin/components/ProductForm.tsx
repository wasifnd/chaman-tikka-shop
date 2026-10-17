'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { Button } from '@/shared/components/ui/Button';
import { Checkbox } from '@/shared/components/ui/Checkbox';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { Textarea } from '@/shared/components/ui/Textarea';
import { useAdminApi } from '../hooks/useAdminApi';
import {
  MAX_VARIANT_GROUPS,
  MAX_VARIANTS_PER_GROUP,
  productInputSchema,
  type ProductFormValues,
  type ProductInput,
} from '../schemas/catalog.schema';
import type { AdminAddon, AdminProductDetail } from '../types/admin.types';
import { applyApiError } from '../utils/api-errors';
import { formatAmount } from '../utils/format-amount';
import { AdminForm, ImageField } from './form-parts';

const BLANK = (categoryId: string): ProductFormValues => ({
  nameEn: '',
  descriptionEn: '',
  categoryId,
  basePrice: undefined as unknown as number,
  discountPrice: undefined,
  thumbnailUrl: '',
  preparationTime: 15,
  sortOrder: 0,
  isAvailable: true,
  isFeatured: false,
  isPopular: false,
  isActive: true,
  stockStatus: 'IN_STOCK',
  variantGroups: [],
  addonIds: [],
});

const toFormValues = (product: AdminProductDetail): ProductFormValues => ({
  ...product,
  discountPrice: product.discountPrice ?? undefined,
});

const moneyInput = { type: 'number', step: '0.01', inputMode: 'decimal' } as const;

function VariantRows({
  groupIndex,
  control,
  register,
  errors,
}: {
  groupIndex: number;
  control: Control<ProductFormValues, unknown, ProductInput>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
}) {
  const t = useTranslations('admin.products');
  const { fields, append, remove } = useFieldArray({
    control,
    name: `variantGroups.${groupIndex}.variants`,
  });
  const groupErrors = errors.variantGroups?.[groupIndex]?.variants;

  return (
    <div className="flex flex-col gap-3">
      {groupErrors?.message ? (
        <p role="alert" className="text-sm text-red-400">
          {groupErrors.message}
        </p>
      ) : null}
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="flex flex-wrap items-end gap-3 rounded-lg bg-stone-900/60 p-3"
        >
          <Input
            label={t('optionName', { n: index + 1 })}
            error={groupErrors?.[index]?.nameEn?.message}
            {...register(`variantGroups.${groupIndex}.variants.${index}.nameEn`)}
          />
          <Input
            label={t('priceChange', { n: index + 1 })}
            error={groupErrors?.[index]?.priceModifier?.message}
            {...moneyInput}
            {...register(`variantGroups.${groupIndex}.variants.${index}.priceModifier`, {
              valueAsNumber: true,
            })}
          />
          <Checkbox
            label={t('optionAvailable')}
            {...register(`variantGroups.${groupIndex}.variants.${index}.isAvailable`)}
          />
          <Button
            variant="ghost"
            aria-label={t('removeOption', { n: index + 1 })}
            onClick={() => {
              remove(index);
            }}
          >
            {t('remove')}
          </Button>
        </div>
      ))}
      <div>
        <Button
          variant="secondary"
          disabled={fields.length >= MAX_VARIANTS_PER_GROUP}
          onClick={() => {
            append({ nameEn: '', priceModifier: 0, isAvailable: true });
          }}
        >
          {t('addOption')}
        </Button>
      </div>
    </div>
  );
}

export function ProductForm({
  initial,
  categories,
  addons,
  uploadsEnabled,
}: {
  initial?: AdminProductDetail;
  categories: { id: string; nameEn: string }[];
  addons: AdminAddon[];
  uploadsEnabled: boolean;
}) {
  const t = useTranslations('admin.products');
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
  } = useForm<ProductFormValues, unknown, ProductInput>({
    resolver: zodResolver(productInputSchema),
    defaultValues: initial ? toFormValues(initial) : BLANK(categories[0]?.id ?? ''),
  });
  const groups = useFieldArray({ control, name: 'variantGroups' });
  const chosenAddons = useWatch({ control, name: 'addonIds' });

  async function onSubmit(values: ProductInput) {
    setFormError(null);
    const result = initial
      ? await api('PATCH', `/api/v1/admin/products/${initial.id}`, values)
      : await api('POST', '/api/v1/admin/products', values);
    if (result.ok) router.push('/admin/menu');
    else setFormError(applyApiError(result.error, setError));
  }

  return (
    <AdminForm
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      formError={formError}
      saving={isSubmitting}
      onCancel={() => {
        router.push('/admin/menu');
      }}
    >
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">{t('basics')}</legend>
        <Input label={t('name')} error={errors.nameEn?.message} {...register('nameEn')} />
        <Textarea
          label={t('description')}
          error={errors.descriptionEn?.message}
          {...register('descriptionEn')}
        />
        <Select
          label={t('category')}
          error={errors.categoryId?.message}
          {...register('categoryId')}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nameEn}
            </option>
          ))}
        </Select>
        <ImageField
          inputProps={register('thumbnailUrl')}
          onUploaded={(url) => {
            setValue('thumbnailUrl', url, { shouldDirty: true });
          }}
          uploadsEnabled={uploadsEnabled}
          error={errors.thumbnailUrl?.message}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">{t('pricing')}</legend>
        <Input
          label={t('basePrice')}
          error={errors.basePrice?.message}
          min="0"
          {...moneyInput}
          {...register('basePrice', { valueAsNumber: true })}
        />
        <Input
          label={t('salePrice')}
          error={errors.discountPrice?.message}
          min="0"
          {...moneyInput}
          {...register('discountPrice', { valueAsNumber: true })}
        />
        <Input
          label={t('prepTime')}
          type="number"
          min="1"
          error={errors.preparationTime?.message}
          {...register('preparationTime', { valueAsNumber: true })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold">{t('visibility')}</legend>
        <Select label={t('stock')} error={errors.stockStatus?.message} {...register('stockStatus')}>
          <option value="IN_STOCK">{t('stockStatus.IN_STOCK')}</option>
          <option value="LIMITED">{t('stockStatus.LIMITED')}</option>
          <option value="OUT_OF_STOCK">{t('stockStatus.OUT_OF_STOCK')}</option>
        </Select>
        <Checkbox label={t('available')} {...register('isAvailable')} />
        <Checkbox label={t('shownToCustomers')} {...register('isActive')} />
        <Checkbox label={t('featured')} {...register('isFeatured')} />
        <Checkbox label={t('popular')} {...register('isPopular')} />
        <Input
          label={t('sortOrder')}
          type="number"
          error={errors.sortOrder?.message}
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">{t('options')}</legend>
        <p className="text-sm text-stone-400">{t('optionsHint')}</p>
        {errors.variantGroups?.message ? (
          <p role="alert" className="text-sm text-red-400">
            {errors.variantGroups.message}
          </p>
        ) : null}
        {groups.fields.map((group, groupIndex) => (
          <div key={group.id} className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-stone-700">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label={t('groupName', { n: groupIndex + 1 })}
                error={errors.variantGroups?.[groupIndex]?.nameEn?.message}
                {...register(`variantGroups.${groupIndex}.nameEn`)}
              />
              <Checkbox
                label={t('groupRequired')}
                {...register(`variantGroups.${groupIndex}.isRequired`)}
              />
              <Button
                variant="ghost"
                aria-label={t('removeGroup', { n: groupIndex + 1 })}
                onClick={() => {
                  groups.remove(groupIndex);
                }}
              >
                {t('removeGroupShort')}
              </Button>
            </div>
            <VariantRows
              groupIndex={groupIndex}
              control={control}
              register={register}
              errors={errors}
            />
          </div>
        ))}
        <div>
          <Button
            variant="secondary"
            disabled={groups.fields.length >= MAX_VARIANT_GROUPS}
            onClick={() => {
              groups.append({ nameEn: '', isRequired: true, variants: [] });
            }}
          >
            {t('addGroup')}
          </Button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-lg font-semibold">{t('addons')}</legend>
        {addons.length === 0 ? <p className="text-sm text-stone-400">{t('noAddons')}</p> : null}
        {errors.addonIds?.message ? (
          <p role="alert" className="text-sm text-red-400">
            {errors.addonIds.message}
          </p>
        ) : null}
        {addons.map((addon) => (
          <Checkbox
            key={addon.id}
            label={`${addon.nameEn} (${formatAmount(addon.price)})`}
            checked={chosenAddons.includes(addon.id)}
            onChange={(event) => {
              setValue(
                'addonIds',
                event.target.checked
                  ? [...chosenAddons, addon.id]
                  : chosenAddons.filter((id) => id !== addon.id),
                { shouldDirty: true },
              );
            }}
          />
        ))}
      </fieldset>
    </AdminForm>
  );
}
