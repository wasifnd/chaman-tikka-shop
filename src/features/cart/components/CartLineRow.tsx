import { useTranslations } from 'next-intl';
import { QuantityStepper } from '@/shared/components/ui/QuantityStepper';
import { formatPrice } from '@/shared/utils/format';
import type { CartItem } from '../store/cart.logic';

interface CartLineRowProps {
  item: CartItem;
  /** Authoritative price from the server, once it has answered for this exact cart. */
  serverUnitPrice: number | null;
  problems: string[];
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}

export function CartLineRow({
  item,
  serverUnitPrice,
  problems,
  onQuantity,
  onRemove,
}: CartLineRowProps) {
  const t = useTranslations('cart');
  const unitPrice = serverUnitPrice ?? item.unitPrice;
  const priceChanged =
    serverUnitPrice !== null && Math.abs(serverUnitPrice - item.unitPrice) >= 0.005;
  const labels = item.kind === 'product' ? item.optionLabels : [];
  const note = item.kind === 'product' ? item.note : undefined;

  return (
    <li className="bg-ash/60 flex flex-col gap-3 rounded-xl p-4 ring-1 ring-stone-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{item.name}</h2>
          {labels.length > 0 ? <p className="text-sm text-stone-400">{labels.join(', ')}</p> : null}
          {note ? <p className="text-sm text-stone-400">{t('note', { note })}</p> : null}
          <p className="text-sm text-stone-400">
            {t('each', { price: formatPrice(unitPrice) })}
            {priceChanged ? (
              <span className="ml-2 rounded-full bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">
                {t('priceUpdated')}
              </span>
            ) : null}
          </p>
        </div>
        <p className="font-semibold whitespace-nowrap">{formatPrice(unitPrice * item.quantity)}</p>
      </div>

      {problems.map((problem) => (
        <p key={problem} role="alert" className="text-sm text-red-400">
          {problem}
        </p>
      ))}

      <div className="flex items-center justify-between">
        <QuantityStepper
          value={item.quantity}
          onChange={onQuantity}
          label={t('quantityOf', { name: item.name })}
          decreaseLabel={t('decrease')}
          increaseLabel={t('increase')}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('remove', { name: item.name })}
          className="focus-visible:outline-ember min-h-11 rounded-lg px-3 text-sm text-stone-400 underline hover:text-white focus-visible:outline-2"
        >
          {t('remove', { name: item.name })}
        </button>
      </div>
    </li>
  );
}
