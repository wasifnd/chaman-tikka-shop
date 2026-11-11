'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { ZoneOption } from '@/features/checkout/types/zone.types';
import { useSignedInApi } from '@/shared/hooks/useSignedInApi';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Checkbox } from '@/shared/components/ui/Checkbox';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { applyApiError } from '@/shared/utils/apply-api-error';
import {
  MAX_ADDRESSES,
  addressInputSchema,
  type AddressFormValues,
  type AddressInput,
} from '../schemas/address.schema';
import type { SavedAddress } from '../types/account.types';

const BLANK: AddressFormValues = {
  label: '',
  addressLine1: '',
  addressLine2: '',
  zoneId: '',
  isDefault: false,
};

function AddressForm({
  initial,
  zones,
  onDone,
}: {
  initial?: SavedAddress;
  zones: ZoneOption[];
  onDone: () => void;
}) {
  const t = useTranslations('account.addresses');
  const common = useTranslations('account.common');
  const api = useSignedInApi();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormValues, unknown, AddressInput>({
    resolver: zodResolver(addressInputSchema),
    defaultValues: initial
      ? {
          label: initial.label,
          addressLine1: initial.addressLine1,
          addressLine2: initial.addressLine2 ?? '',
          zoneId: initial.zoneActive ? initial.zoneId : '',
          isDefault: initial.isDefault,
        }
      : BLANK,
  });

  async function onSubmit(values: AddressInput) {
    setFormError(null);
    const result = initial
      ? await api('PATCH', `/api/v1/account/addresses/${initial.id}`, values)
      : await api('POST', '/api/v1/account/addresses', values);
    if (result.ok) onDone();
    else setFormError(applyApiError(result.error, setError));
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="bg-ash/50 flex flex-col gap-4 rounded-xl p-4 ring-1 ring-stone-800"
    >
      {formError ? <Alert>{formError}</Alert> : null}
      <Input
        label={t('label')}
        placeholder={t('labelHint')}
        error={errors.label?.message}
        {...register('label')}
      />
      <Input
        label={t('street')}
        autoComplete="address-line1"
        error={errors.addressLine1?.message}
        {...register('addressLine1')}
      />
      <Input
        label={t('line2')}
        autoComplete="address-line2"
        error={errors.addressLine2?.message}
        {...register('addressLine2')}
      />
      <Select label={t('area')} error={errors.zoneId?.message} {...register('zoneId')}>
        <option value="">{t('chooseArea')}</option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {zone.name}
          </option>
        ))}
      </Select>
      <Checkbox label={t('makeDefault')} {...register('isDefault')} />
      <div className="flex gap-2">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? common('saving') : common('save')}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          {common('cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Delete with a second tap, so a slip of the finger never removes an address. */
function ConfirmDelete({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const common = useTranslations('account.common');
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        variant="ghost"
        aria-label={label}
        onClick={() => {
          setAsking(true);
        }}
      >
        {common('delete')}
      </Button>
    );
  }
  return (
    <span className="flex gap-2">
      <Button
        variant="secondary"
        aria-label={common('confirmLabel', { name: label })}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {common('confirmDelete')}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setAsking(false);
        }}
      >
        {common('cancel')}
      </Button>
    </span>
  );
}

export function AddressesManager({
  addresses,
  zones,
}: {
  addresses: SavedAddress[];
  zones: ZoneOption[];
}) {
  const t = useTranslations('account.addresses');
  const common = useTranslations('account.common');
  const api = useSignedInApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(address: SavedAddress) {
    setError(null);
    const result = await api('DELETE', `/api/v1/account/addresses/${address.id}`);
    if (!result.ok) setError(result.error.message);
  }

  const full = addresses.length >= MAX_ADDRESSES;

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert>{error}</Alert> : null}

      {adding ? (
        <AddressForm
          zones={zones}
          onDone={() => {
            setAdding(false);
          }}
        />
      ) : (
        <div className="flex flex-col items-start gap-1">
          <Button
            disabled={full || zones.length === 0}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('add')}
          </Button>
          {full ? (
            <p className="text-sm text-stone-400">{t('limit', { max: MAX_ADDRESSES })}</p>
          ) : null}
          {zones.length === 0 ? <p className="text-sm text-stone-400">{t('noAreas')}</p> : null}
        </div>
      )}

      {addresses.length === 0 ? <p className="text-stone-400">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {addresses.map((address) =>
          editing === address.id ? (
            <li key={address.id}>
              <AddressForm
                initial={address}
                zones={zones}
                onDone={() => {
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li
              key={address.id}
              className="bg-ash flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <div>
                <p className="font-semibold">
                  {address.label}
                  {address.isDefault ? (
                    <span className="text-ember ml-2 text-sm">{t('defaultBadge')}</span>
                  ) : null}
                </p>
                <p className="text-sm text-stone-300">
                  {[address.addressLine1, address.addressLine2, address.zoneName]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {address.zoneActive ? null : (
                  <p className="text-sm text-amber-300">{t('areaUnavailable')}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  aria-label={common('editLabel', { name: address.label })}
                  onClick={() => {
                    setEditing(address.id);
                  }}
                >
                  {common('edit')}
                </Button>
                <ConfirmDelete
                  label={common('deleteLabel', { name: address.label })}
                  onConfirm={() => void remove(address)}
                />
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
