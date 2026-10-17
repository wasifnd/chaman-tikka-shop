import { getTranslations } from 'next-intl/server';
import { DealsTable } from '@/features/admin/components/DealsTable';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { deals } from '@/features/admin/server';

export const metadata = { title: 'Admin deals' };

export default async function AdminDealsPage() {
  const [t, rows] = await Promise.all([getTranslations('admin.deals'), deals.list()]);
  return (
    <>
      <PageTitle title={t('title')} hint={t('hint')} />
      <DealsTable deals={rows} now={new Date().toISOString()} />
    </>
  );
}
