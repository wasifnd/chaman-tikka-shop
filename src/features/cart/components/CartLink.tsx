'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { itemCount } from '../store/cart.logic';
import { useCartHydrated } from '../store/useCartHydrated';
import { useCartStore } from '../store/useCartStore';

/** Header link with an item-count badge. The badge waits for the saved cart so it never flashes 0. */
export function CartLink() {
  const t = useTranslations('nav');
  const hydrated = useCartHydrated();
  const count = useCartStore((state) => itemCount(state));
  const shown = hydrated ? count : 0;

  return (
    <Link
      href="/cart"
      aria-label={shown > 0 ? t('cartWithCount', { count: shown }) : t('cart')}
      className="focus-visible:outline-ember relative inline-flex size-11 items-center justify-center rounded-lg text-stone-300 hover:text-white focus-visible:outline-2"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.76L20 8H6" />
        <circle cx="9.5" cy="20" r="1.2" />
        <circle cx="17" cy="20" r="1.2" />
      </svg>
      {shown > 0 ? (
        <span
          aria-hidden="true"
          className="bg-ember absolute top-0.5 right-0.5 flex min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
        >
          {shown}
        </span>
      ) : null}
    </Link>
  );
}
