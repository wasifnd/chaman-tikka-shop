import { getTranslations } from 'next-intl/server';
import { AddonsManager } from '@/features/admin/components/AddonsManager';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { products } from '@/features/admin/server';

export const metadata = { title: 'Admin add-ons' };

export default async function AdminAddonsPage() {
  const [t, rows] = await Promise.all([getTranslations('admin.addons'), products.listAddons()]);
  return (
    <>
      <PageTitle title={t('title')} />
      <AddonsManager addons={rows} />
    </>
  );
}
