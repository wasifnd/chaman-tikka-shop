import { getTranslations } from 'next-intl/server';
import { AddressesManager } from '@/features/account/components/AddressesManager';
import { account } from '@/features/account/server';
import { getDeliveryZones } from '@/features/checkout/server';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'My addresses' };

export default async function AccountAddressesPage() {
  const session = await getSession();
  if (!session?.customerId) return null;

  const [t, addresses, zones] = await Promise.all([
    getTranslations('account.addresses'),
    account.listAddresses(session.customerId),
    getDeliveryZones(),
  ]);
  return (
    <>
      <h2 className="mb-1 text-xl font-semibold">{t('title')}</h2>
      <p className="mb-5 text-sm text-stone-400">{t('hint')}</p>
      <AddressesManager addresses={addresses} zones={zones} />
    </>
  );
}
