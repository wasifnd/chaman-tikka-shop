import { getTranslations } from 'next-intl/server';
import { DealForm } from '@/features/admin/components/DealForm';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { products } from '@/features/admin/server';
import { uploadsEnabled } from '@/features/admin/server-page';

export const metadata = { title: 'New deal' };

export default async function NewDealPage() {
  const [t, options] = await Promise.all([
    getTranslations('admin.deals'),
    products.pickerOptions(),
  ]);
  return (
    <>
      <PageTitle title={t('newTitle')} />
      <DealForm products={options} uploadsEnabled={uploadsEnabled()} />
    </>
  );
}
