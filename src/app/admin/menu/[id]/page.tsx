import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { ProductForm } from '@/features/admin/components/ProductForm';
import { categories, products } from '@/features/admin/server';
import { uploadsEnabled } from '@/features/admin/server-page';

export const metadata = { title: 'Edit product' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const [t, product, cats, addons] = await Promise.all([
    getTranslations('admin.products'),
    products.get(id.data),
    categories.list(),
    products.listAddons(),
  ]);
  if (!product) notFound();

  return (
    <>
      <PageTitle title={t('editTitle', { name: product.nameEn })} />
      <ProductForm
        initial={product}
        categories={cats.map(({ id: categoryId, nameEn }) => ({ id: categoryId, nameEn }))}
        addons={addons}
        uploadsEnabled={uploadsEnabled()}
      />
    </>
  );
}
