import { getTranslations } from 'next-intl/server';
import { CategoriesManager } from '@/features/admin/components/CategoriesManager';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { categories } from '@/features/admin/server';
import { uploadsEnabled } from '@/features/admin/server-page';

export const metadata = { title: 'Admin categories' };

export default async function AdminCategoriesPage() {
  const [t, rows] = await Promise.all([getTranslations('admin.categories'), categories.list()]);
  return (
    <>
      <PageTitle title={t('title')} hint={t('hint')} />
      <CategoriesManager categories={rows} uploadsEnabled={uploadsEnabled()} />
    </>
  );
}
