'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/shared/components/ui/Button';
import { Checkbox } from '@/shared/components/ui/Checkbox';
import { Input } from '@/shared/components/ui/Input';
import { Textarea } from '@/shared/components/ui/Textarea';
import { useAdminApi } from '../hooks/useAdminApi';
import {
  categoryInputSchema,
  type CategoryFormValues,
  type CategoryInput,
} from '../schemas/catalog.schema';
import type { AdminCategory } from '../types/admin.types';
import { applyApiError } from '../utils/api-errors';
import { AdminForm, DeleteButton, ImageField } from './form-parts';

const BLANK: CategoryFormValues = {
  nameEn: '',
  descriptionEn: '',
  imageUrl: '',
  sortOrder: 0,
  isActive: true,
  isFeatured: false,
};

function CategoryForm({
  initial,
  uploadsEnabled,
  onDone,
}: {
  initial?: AdminCategory;
  uploadsEnabled: boolean;
  onDone: () => void;
}) {
  const t = useTranslations('admin.categories');
  const api = useAdminApi();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues, unknown, CategoryInput>({
    resolver: zodResolver(categoryInputSchema),
    defaultValues: initial ? { ...initial } : BLANK,
  });

  async function onSubmit(values: CategoryInput) {
    setFormError(null);
    const result = initial
      ? await api('PATCH', `/api/v1/admin/categories/${initial.id}`, values)
      : await api('POST', '/api/v1/admin/categories', values);
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
        label={t('sortOrder')}
        type="number"
        error={errors.sortOrder?.message}
        {...register('sortOrder', { valueAsNumber: true })}
      />
      <div className="flex flex-wrap gap-x-6">
        <Checkbox label={t('shownToCustomers')} {...register('isActive')} />
        <Checkbox label={t('featured')} {...register('isFeatured')} />
      </div>
    </AdminForm>
  );
}

export function CategoriesManager({
  categories,
  uploadsEnabled,
}: {
  categories: AdminCategory[];
  uploadsEnabled: boolean;
}) {
  const t = useTranslations('admin.categories');
  const common = useTranslations('admin.common');
  const api = useAdminApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(category: AdminCategory) {
    setError(null);
    const result = await api('DELETE', `/api/v1/admin/categories/${category.id}`);
    if (!result.ok) setError(result.error.message);
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {editing === 'new' ? (
        <CategoryForm
          uploadsEnabled={uploadsEnabled}
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

      {categories.length === 0 ? <p className="text-stone-400">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {categories.map((category) =>
          editing === category.id ? (
            <li key={category.id}>
              <CategoryForm
                initial={category}
                uploadsEnabled={uploadsEnabled}
                onDone={() => {
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li
              key={category.id}
              className="bg-ash flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <div>
                <p className="font-semibold">{category.nameEn}</p>
                <p className="text-sm text-stone-400">
                  {t('productCount', { count: category.productCount })}
                  {category.isActive ? '' : ` · ${common('hidden')}`}
                  {category.isFeatured ? ` · ${t('featured')}` : ''}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  aria-label={common('editLabel', { name: category.nameEn })}
                  onClick={() => {
                    setEditing(category.id);
                  }}
                >
                  {common('edit')}
                </Button>
                <DeleteButton
                  label={common('deleteLabel', { name: category.nameEn })}
                  onConfirm={() => void remove(category)}
                />
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
