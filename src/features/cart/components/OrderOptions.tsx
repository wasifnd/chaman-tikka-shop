import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { OrderType } from '@/features/checkout/types/quote.types';
import type { ZoneOption } from '@/features/checkout/types/zone.types';

interface OrderOptionsProps {
  orderType: OrderType;
  zoneId: string | null;
  zones: ZoneOption[];
  onOrderType: (type: OrderType) => void;
  onZone: (zoneId: string | null) => void;
}

const TYPES: { value: OrderType; label: 'delivery' | 'pickup' | 'dineIn' }[] = [
  { value: 'DELIVERY', label: 'delivery' },
  { value: 'PICKUP', label: 'pickup' },
  { value: 'DINE_IN', label: 'dineIn' },
];

export function OrderOptions({ orderType, zoneId, zones, onOrderType, onZone }: OrderOptionsProps) {
  const t = useTranslations('cart');
  const selectId = useId();

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{t('orderType')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map(({ value, label }) => (
            <label
              key={value}
              className="bg-ash/60 has-checked:ring-ember has-focus-visible:outline-ember flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-sm ring-1 ring-stone-800 has-focus-visible:outline-2"
            >
              <input
                type="radio"
                name="order-type"
                value={value}
                checked={orderType === value}
                onChange={() => {
                  onOrderType(value);
                }}
                className="sr-only"
              />
              {t(label)}
            </label>
          ))}
        </div>
      </fieldset>

      {orderType === 'DELIVERY' ? (
        zones.length === 0 ? (
          <p className="text-sm text-stone-400">{t('noAreas')}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={selectId} className="font-semibold">
              {t('area')}
            </label>
            <select
              id={selectId}
              value={zoneId ?? ''}
              onChange={(event) => {
                onZone(event.target.value === '' ? null : event.target.value);
              }}
              className="bg-ash focus-visible:outline-ember min-h-11 rounded-lg px-3 text-stone-100 ring-1 ring-stone-700 focus-visible:outline-2"
            >
              <option value="">{t('chooseArea')}</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.charge === 0
                    ? t('areaFree', { name: zone.name })
                    : t('areaFee', { name: zone.name, charge: zone.charge })}
                </option>
              ))}
            </select>
          </div>
        )
      ) : null}
    </div>
  );
}
