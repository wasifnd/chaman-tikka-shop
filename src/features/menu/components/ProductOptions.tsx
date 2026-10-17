'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatPrice } from '@/shared/utils/format';
import { calculateUnitPrice, missingRequiredGroups, type Selection } from '../pricing';
import type { ProductDetail } from '../types/menu.types';

/** Variant and add-on pickers with a live total. The cart button arrives with checkout. */
export function ProductOptions({ product }: { product: ProductDetail }) {
  const t = useTranslations('product');
  const [selection, setSelection] = useState<Selection>({ variants: {}, addonIds: [] });

  const total = calculateUnitPrice(product.price, product.variantGroups, product.addons, selection);
  const missing = missingRequiredGroups(product.variantGroups, selection);

  function chooseVariant(groupId: string, variantId: string) {
    setSelection((current) => ({
      ...current,
      variants: { ...current.variants, [groupId]: variantId || undefined },
    }));
  }

  function toggleAddon(addonId: string, checked: boolean) {
    setSelection((current) => ({
      ...current,
      addonIds: checked
        ? [...current.addonIds, addonId]
        : current.addonIds.filter((id) => id !== addonId),
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      {product.variantGroups.map((group) => (
        <fieldset key={group.id} className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">
            {group.name}{' '}
            <span className="text-sm font-normal text-stone-400">
              {group.isRequired ? t('required') : t('optional')}
            </span>
          </legend>
          {!group.isRequired ? (
            <Choice
              type="radio"
              name={group.id}
              label={t('none')}
              checked={!selection.variants[group.id]}
              onChange={() => {
                chooseVariant(group.id, '');
              }}
            />
          ) : null}
          {group.variants.map((variant) => (
            <Choice
              key={variant.id}
              type="radio"
              name={group.id}
              label={variant.name}
              hint={variant.priceModifier ? `+${formatPrice(variant.priceModifier)}` : undefined}
              checked={selection.variants[group.id] === variant.id}
              onChange={() => {
                chooseVariant(group.id, variant.id);
              }}
            />
          ))}
        </fieldset>
      ))}

      {product.addons.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{t('addons')}</legend>
          {product.addons.map((addon) => (
            <Choice
              key={addon.id}
              type="checkbox"
              name={`addon-${addon.id}`}
              label={addon.name}
              hint={`+${formatPrice(addon.price)}`}
              checked={selection.addonIds.includes(addon.id)}
              onChange={(checked) => {
                toggleAddon(addon.id, checked);
              }}
            />
          ))}
        </fieldset>
      ) : null}

      <div className="border-t border-stone-800 pt-4">
        <p className="flex items-baseline justify-between text-lg font-bold">
          <span>{t('total')}</span>
          <span aria-live="polite">{formatPrice(total)}</span>
        </p>
        {missing.length > 0 && product.orderable ? (
          <p className="mt-1 text-sm text-stone-400">
            {t('choose', { groups: missing.join(', ') })}
          </p>
        ) : null}
        {!product.orderable ? (
          <p className="mt-1 text-sm text-stone-400">{t('unavailable')}</p>
        ) : null}
      </div>
    </div>
  );
}

interface ChoiceProps {
  type: 'radio' | 'checkbox';
  name: string;
  label: string;
  hint?: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Choice({ type, name, label, hint, checked, onChange }: ChoiceProps) {
  return (
    <label className="bg-ash/60 has-checked:ring-ember flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 ring-1 ring-stone-800">
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="accent-ember size-4"
      />
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-sm text-stone-400">{hint}</span> : null}
    </label>
  );
}
