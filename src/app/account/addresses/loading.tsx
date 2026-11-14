import { getTranslations } from 'next-intl/server';
import { PageLoading } from '@/shared/components/ui/PageLoading';

export default async function Loading() {
  const t = await getTranslations('loading');
  return <PageLoading label={t('page')} shape="list" />;
}
