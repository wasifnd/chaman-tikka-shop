import { getTranslations } from 'next-intl/server';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { ZonesManager } from '@/features/admin/components/ZonesManager';
import { operations } from '@/features/admin/server';

export const metadata = { title: 'Admin delivery areas' };

export default async function AdminDeliveryPage() {
  const [t, zones] = await Promise.all([getTranslations('admin.zones'), operations.listZones()]);
  return (
    <>
      <PageTitle title={t('title')} />
      <ZonesManager zones={zones} />
    </>
  );
}
