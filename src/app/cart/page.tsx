import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CartView } from '@/features/cart/components/CartView';
import { getDeliveryZones } from '@/features/checkout/server';

// The page shell is static; the cart itself lives in the browser and is priced by the API.
export const revalidate = 300;

// A cart is private to the visitor, so search engines should skip it.
export const metadata: Metadata = { title: 'Your cart', robots: { index: false } };

export default async function CartPage() {
  const [zones, t] = await Promise.all([getDeliveryZones(), getTranslations('cart')]);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{t('title')}</h1>
      <CartView zones={zones} />
    </main>
  );
}
