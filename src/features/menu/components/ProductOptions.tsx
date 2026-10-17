'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { useCartHydrated } from '@/features/cart/store/useCartHydrated';
import { useCartStore } from '@/features/cart/store/useCartStore';
import { Button } from '@/shared/components/ui/Button';
import { QuantityStepper } from '@/shared/components/ui/QuantityStepper';
import { formatPrice } from '@/shared/utils/format';
import { calculateUnitPrice, missingRequiredGroups, type Selection } from '../pricing';
import type { ProductDetail } from '../types/menu.types';

/** Variant and add-on pickers with a live total and an add-to-cart button. */
export function ProductOptions({ product }: { product: ProductDetail }) {
  const t = useTranslations('product');
  const tc = useTranslations('cart');
  const [selection, setSelection] = useState<Selection>({ variants: {}, addonIds: [] });
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const addToCart = useCartStore((state) => state.add);
  // Adding before the saved cart is loaded would overwrite it, so wait.
  const cartReady = useCartHydrated();

  const total = calculateUnitPrice(product.price, product.variantGroups, product.addons, selection);
  const missing = missingRequiredGroups(product.variantGroups, selection);
  const canAdd = product.orderable && missing.length === 0 && cartReady;

  function add() {
    const chosenVariants = product.variantGroups.flatMap((group) => {
      const variant = group.variants.find((v) => v.id === selection.variants[group.id]);
      return variant ? [variant] : [];
    });
    const chosenAddons = product.addons.filter((addon) => selection.addonIds.includes(addon.id));
    addToCart({
      kind: 'product',
      productId: product.id,
      name: product.name,
      unitPrice: total,
      quantity,
      variantIds: chosenVariants.map((v) => v.id),
      addonIds: chosenAddons.map((a) => a.id),
      optionLabels: [...chosenVariants.map((v) => v.name), ...chosenAddons.map((a) => a.name)],
    });
    setQuantity(1);
    setJustAdded(true);
  }

  function chooseVariant(groupId: string, variantId: string) {
    setJustAdded(false);
    setSelection((current) => ({
      ...current,
      variants: { ...current.variants, [groupId]: variantId || undefined },
    }));
  }

  function toggleAddon(addonId: string, checked: boolean) {
    setJustAdded(false);
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

        {product.orderable ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <QuantityStepper
              value={quantity}
              onChange={(next) => {
                setQuantity(next);
                setJustAdded(false);
              }}
              label={t('quantity')}
              decreaseLabel={tc('decrease')}
              increaseLabel={tc('increase')}
            />
            <Button className="flex-1" disabled={!canAdd} onClick={add}>
              {t('addToCart')}
            </Button>
          </div>
        ) : null}
        <p role="status" className="mt-2 min-h-5 text-sm text-green-400">
          {justAdded ? (
            <>
              {t('added', { name: product.name })}{' '}
              <Link href="/cart" className="underline">
                {t('viewCart')}
              </Link>
            </>
          ) : null}
        </p>
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
