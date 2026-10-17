import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getDeliveryZones } from '@/features/checkout/server';
import { CheckoutView } from '@/features/orders/components/CheckoutView';

// The page shell is static; the cart lives in the browser and is priced by the API.
export const revalidate = 300;

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage() {
  const [zones, t] = await Promise.all([getDeliveryZones(), getTranslations('checkout')]);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">{t('title')}</h1>
      <CheckoutView zones={zones} />
    </main>
  );
}
