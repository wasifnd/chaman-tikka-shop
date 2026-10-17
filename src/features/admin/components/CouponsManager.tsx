'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/shared/components/ui/Button';
import { Checkbox } from '@/shared/components/ui/Checkbox';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { useAdminApi } from '../hooks/useAdminApi';
import {
  couponInputSchema,
  type CouponFormValues,
  type CouponInput,
} from '../schemas/operations.schema';
import type { AdminCoupon } from '../types/admin.types';
import { applyApiError } from '../utils/api-errors';
import { formatAmount } from '../utils/format-amount';
import { AdminForm, DateTimeField, DeleteButton } from './form-parts';

const BLANK: CouponFormValues = {
  code: '',
  type: 'PERCENTAGE',
  amount: 10,
  minimumOrderAmount: 0,
  usageLimit: undefined,
  expiresAt: null,
  isActive: true,
};

function CouponForm({ initial, onDone }: { initial?: AdminCoupon; onDone: () => void }) {
  const t = useTranslations('admin.coupons');
  const api = useAdminApi();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CouponFormValues, unknown, CouponInput>({
    resolver: zodResolver(couponInputSchema),
    defaultValues: initial ? { ...initial, usageLimit: initial.usageLimit ?? undefined } : BLANK,
  });

  async function onSubmit(values: CouponInput) {
    setFormError(null);
    const result = initial
      ? await api('PATCH', `/api/v1/admin/coupons/${initial.id}`, values)
      : await api('POST', '/api/v1/admin/coupons', values);
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
      <Input
        label={t('code')}
        autoCapitalize="characters"
        error={errors.code?.message}
        {...register('code')}
      />
      <Select label={t('type')} error={errors.type?.message} {...register('type')}>
        <option value="PERCENTAGE">{t('typePercentage')}</option>
        <option value="FIXED">{t('typeFixed')}</option>
      </Select>
      <Input
        label={t('amount')}
        error={errors.amount?.message}
        {...money}
        {...register('amount', { valueAsNumber: true })}
      />
      <Input
        label={t('minOrder')}
        error={errors.minimumOrderAmount?.message}
        {...money}
        {...register('minimumOrderAmount', { valueAsNumber: true })}
      />
      <Input
        label={t('usageLimit')}
        type="number"
        min="1"
        error={errors.usageLimit?.message}
        {...register('usageLimit', { valueAsNumber: true })}
      />
      <Controller
        control={control}
        name="expiresAt"
        render={({ field }) => (
          <DateTimeField
            label={t('expires')}
            value={field.value}
            onChange={field.onChange}
            error={errors.expiresAt?.message}
          />
        )}
      />
      <Checkbox label={t('active')} {...register('isActive')} />
    </AdminForm>
  );
}

function describe(coupon: AdminCoupon, t: ReturnType<typeof useTranslations>): string {
  const value =
    coupon.type === 'PERCENTAGE'
      ? t('percentOff', { value: coupon.amount })
      : t('amountOff', { amount: formatAmount(coupon.amount) });
  const limit =
    coupon.usageLimit === null
      ? t('usedUnlimited', { used: coupon.usedCount })
      : t('usedOf', { used: coupon.usedCount, limit: coupon.usageLimit });
  return `${value} · ${limit}`;
}

export function CouponsManager({ coupons }: { coupons: AdminCoupon[] }) {
  const t = useTranslations('admin.coupons');
  const common = useTranslations('admin.common');
  const api = useAdminApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(coupon: AdminCoupon) {
    setError(null);
    const result = await api('DELETE', `/api/v1/admin/coupons/${coupon.id}`);
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
        <CouponForm
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
      {coupons.length === 0 ? <p className="text-stone-400">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {coupons.map((coupon) =>
          editing === coupon.id ? (
            <li key={coupon.id}>
              <CouponForm
                initial={coupon}
                onDone={() => {
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li
              key={coupon.id}
              className="bg-ash flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <div>
                <p className="font-mono font-semibold">{coupon.code}</p>
                <p className="text-sm text-stone-400">
                  {describe(coupon, t)}
                  {coupon.isActive ? '' : ` · ${common('switchedOff')}`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  aria-label={common('editLabel', { name: coupon.code })}
                  onClick={() => {
                    setEditing(coupon.id);
                  }}
                >
                  {common('edit')}
                </Button>
                <DeleteButton
                  label={common('deleteLabel', { name: coupon.code })}
                  onConfirm={() => void remove(coupon)}
                />
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
