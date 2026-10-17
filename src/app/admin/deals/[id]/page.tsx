import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { DealForm } from '@/features/admin/components/DealForm';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { deals, products } from '@/features/admin/server';
import { uploadsEnabled } from '@/features/admin/server-page';

export const metadata = { title: 'Edit deal' };

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const [t, deal, options] = await Promise.all([
    getTranslations('admin.deals'),
    deals.get(id.data),
    products.pickerOptions(),
  ]);
  if (!deal) notFound();

  return (
    <>
      <PageTitle title={t('editTitle', { name: deal.nameEn })} />
      <DealForm initial={deal} products={options} uploadsEnabled={uploadsEnabled()} />
    </>
  );
}
