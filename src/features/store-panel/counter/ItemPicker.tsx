'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { NewCartItem } from '@/features/cart/store/cart.logic';
import { calculateUnitPrice, missingRequiredGroups, type Selection } from '@/features/menu/pricing';
import type { ProductDetail } from '@/features/menu/types/menu.types';
import { fromMinor, toMinor } from '@/lib/money';
import { Button } from '@/shared/components/ui/Button';
import { QuantityStepper } from '@/shared/components/ui/QuantityStepper';
import { formatPrice } from '@/shared/utils/format';
import { defaultSelection, productLine } from './counter-logic';

interface ItemPickerProps {
  product: ProductDetail;
  onAdd: (line: NewCartItem) => void;
  onCancel: () => void;
}

/** Size, add-ons and quantity for one product, then onto the ticket. */
export function ItemPicker({ product, onAdd, onCancel }: ItemPickerProps) {
  const t = useTranslations('counter');
  const tp = useTranslations('product');
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(product));
  const [quantity, setQuantity] = useState(1);
  const unit = calculateUnitPrice(product.price, product.variantGroups, product.addons, selection);
  const missing = missingRequiredGroups(product.variantGroups, selection);

  return (
    <section aria-labelledby="picker-title" className="bg-ash ring-gold/40 rounded-xl p-4 ring-1">
      <h3 id="picker-title" className="mb-3 text-lg font-semibold">
        {product.name}
      </h3>
      <div className="flex flex-col gap-4">
        {product.variantGroups.map((group) => (
          <fieldset key={group.id} className="flex flex-wrap gap-2">
            <legend className="mb-1 w-full text-sm font-medium text-stone-300">{group.name}</legend>
            {group.variants.map((variant) => {
              const chosen = selection.variants[group.id] === variant.id;
              return (
                <label
                  key={variant.id}
                  className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm ring-1 ${
                    chosen ? 'bg-ember ring-ember text-white' : 'ring-stone-700'
                  }`}
                >
                  <input
                    type="radio"
                    name={group.id}
                    className="sr-only"
                    checked={chosen}
                    onChange={() => {
                      setSelection((s) => ({
                        ...s,
                        variants: { ...s.variants, [group.id]: variant.id },
                      }));
                    }}
                  />
                  {variant.name}
                  {variant.priceModifier ? ` +${formatPrice(variant.priceModifier)}` : ''}
                </label>
              );
            })}
          </fieldset>
        ))}
        {product.addons.length > 0 ? (
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-1 w-full text-sm font-medium text-stone-300">
              {tp('addons')}
            </legend>
            {product.addons.map((addon) => {
              const chosen = selection.addonIds.includes(addon.id);
              return (
                <label
                  key={addon.id}
                  className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm ring-1 ${
                    chosen ? 'bg-ember ring-ember text-white' : 'ring-stone-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={chosen}
                    onChange={(event) => {
                      const { checked } = event.target;
                      setSelection((s) => ({
                        ...s,
                        addonIds: checked
                          ? [...s.addonIds, addon.id]
                          : s.addonIds.filter((id) => id !== addon.id),
                      }));
                    }}
                  />
                  {addon.name} +{formatPrice(addon.price)}
                </label>
              );
            })}
          </fieldset>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            label={t('quantityOf', { name: product.name })}
            decreaseLabel={t('fewer')}
            increaseLabel={t('more')}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              {t('cancel')}
            </Button>
            <Button
              disabled={missing.length > 0}
              onClick={() => {
                onAdd(productLine(product, selection, quantity));
              }}
            >
              {t('addFor', { amount: formatPrice(fromMinor(toMinor(unit) * quantity)) })}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
