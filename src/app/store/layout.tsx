import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { StoreNav } from '@/features/store-panel/components/StoreNav';
import { isStaffRole } from '@/lib/auth/roles';
import { getSession } from '@/lib/auth/session';

// Staff screens are live and private: never cache or index them.
export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  // The proxy already turns away signed-out visitors; checking again here means a mistake in the
  // proxy rules can never expose these pages.
  const session = await getSession();
  if (!session || !isStaffRole(session.role)) redirect('/auth/login?next=/store/orders');

  const t = await getTranslations('store');
  return (
    <div className="mx-auto w-full max-w-440 px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('panel')}</h1>
        <StoreNav />
      </div>
      {children}
    </div>
  );
}
