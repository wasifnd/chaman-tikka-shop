import { getTranslations } from 'next-intl/server';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { ProductsTable } from '@/features/admin/components/ProductsTable';
import { categories, products } from '@/features/admin/server';

export const metadata = { title: 'Admin menu' };

export default async function AdminMenuPage() {
  const [t, rows, cats] = await Promise.all([
    getTranslations('admin.products'),
    products.list(),
    categories.list(),
  ]);
  return (
    <>
      <PageTitle title={t('title')} hint={t('hint')} />
      <ProductsTable products={rows} categories={cats.map(({ id, nameEn }) => ({ id, nameEn }))} />
    </>
  );
}
