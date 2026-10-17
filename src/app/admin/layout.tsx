import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/features/admin/components/AdminNav';
import { ADMIN_ROLES } from '@/lib/auth/roles';
import { getSession } from '@/lib/auth/session';

// Admin screens are private and always current: never cache or index them.
export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The proxy already turns away everyone else; checking again here means a mistake in the proxy
  // rules can never expose these pages.
  const session = await getSession();
  if (!session || !ADMIN_ROLES.includes(session.role)) redirect('/auth/login?next=/admin');

  const t = await getTranslations('admin');
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-3">
        <h1 className="text-2xl font-bold">{t('panel')}</h1>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
