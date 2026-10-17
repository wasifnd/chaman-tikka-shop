import { getTranslations } from 'next-intl/server';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { ProductForm } from '@/features/admin/components/ProductForm';
import { categories, products } from '@/features/admin/server';
import { uploadsEnabled } from '@/features/admin/server-page';

export const metadata = { title: 'New product' };

export default async function NewProductPage() {
  const [t, cats, addons] = await Promise.all([
    getTranslations('admin.products'),
    categories.list(),
    products.listAddons(),
  ]);
  return (
    <>
      <PageTitle title={t('newTitle')} />
      {cats.length === 0 ? (
        <p className="text-stone-400">{t('needCategory')}</p>
      ) : (
        <ProductForm
          categories={cats.map(({ id, nameEn }) => ({ id, nameEn }))}
          addons={addons}
          uploadsEnabled={uploadsEnabled()}
        />
      )}
    </>
  );
}
