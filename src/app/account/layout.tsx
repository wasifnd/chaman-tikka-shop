import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccountNav } from '@/features/account/components/AccountNav';
import { isStaffRole } from '@/lib/auth/roles';
import { getSession } from '@/lib/auth/session';

// Private and personal: never cache or index.
export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // The proxy already turns away signed-out visitors; checking again means a mistake in the proxy
  // rules can never expose these pages.
  const session = await getSession();
  if (!session) redirect('/auth/login?next=/account/orders');

  const t = await getTranslations('account');
  // Staff and admin accounts exist to run the shop; they have no order history of their own.
  if (!session.customerId) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 px-4 py-12">
        <h1 className="font-display text-gold text-3xl tracking-wide">{t('noProfile.title')}</h1>
        <p className="text-stone-400">{t('noProfile.body')}</p>
        <Link
          href={isStaffRole(session.role) ? '/store/orders' : '/'}
          className="text-gold underline"
        >
          {t('noProfile.link')}
        </Link>
      </main>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3">
        <h1 className="font-display text-gold text-3xl tracking-wide">{t('title')}</h1>
        <AccountNav />
      </div>
      {children}
    </div>
  );
}
