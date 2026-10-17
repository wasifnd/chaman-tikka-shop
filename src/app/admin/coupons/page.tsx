import { getTranslations } from 'next-intl/server';
import { CouponsManager } from '@/features/admin/components/CouponsManager';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { operations } from '@/features/admin/server';

export const metadata = { title: 'Admin coupons' };

export default async function AdminCouponsPage() {
  const [t, coupons] = await Promise.all([
    getTranslations('admin.coupons'),
    operations.listCoupons(),
  ]);
  return (
    <>
      <PageTitle title={t('title')} hint={t('hint')} />
      <CouponsManager coupons={coupons} />
    </>
  );
}
