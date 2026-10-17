import { getTranslations } from 'next-intl/server';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { SettingsForm } from '@/features/admin/components/SettingsForm';
import { operations } from '@/features/admin/server';

export const metadata = { title: 'Admin settings' };

export default async function AdminSettingsPage() {
  const [t, settings] = await Promise.all([
    getTranslations('admin.settings'),
    operations.getSettings(),
  ]);
  return (
    <>
      <PageTitle title={t('title')} />
      <SettingsForm initial={settings} />
    </>
  );
}
