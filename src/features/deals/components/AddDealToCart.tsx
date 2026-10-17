'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { useCartHydrated } from '@/features/cart/store/useCartHydrated';
import { useCartStore } from '@/features/cart/store/useCartStore';
import type { DealSummary } from '@/features/menu/types/menu.types';
import { Button } from '@/shared/components/ui/Button';
import { QuantityStepper } from '@/shared/components/ui/QuantityStepper';

export function AddDealToCart({ deal }: { deal: DealSummary }) {
  const t = useTranslations('deals');
  const tp = useTranslations('product');
  const tc = useTranslations('cart');
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const add = useCartStore((state) => state.add);
  const cartReady = useCartHydrated();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper
          value={quantity}
          onChange={(next) => {
            setQuantity(next);
            setJustAdded(false);
          }}
          label={tp('quantity')}
          decreaseLabel={tc('decrease')}
          increaseLabel={tc('increase')}
        />
        <Button
          className="flex-1"
          disabled={!cartReady}
          onClick={() => {
            add({
              kind: 'deal',
              dealId: deal.id,
              name: deal.name,
              unitPrice: deal.price,
              quantity,
            });
            setQuantity(1);
            setJustAdded(true);
          }}
        >
          {t('addToCart')}
        </Button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-green-400">
        {justAdded ? (
          <>
            {t('added', { name: deal.name })}{' '}
            <Link href="/cart" className="underline">
              {tp('viewCart')}
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
