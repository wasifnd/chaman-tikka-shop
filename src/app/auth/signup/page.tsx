import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SignupForm } from '@/features/auth/components/SignupForm';
import { safeNextPath } from '@/lib/auth/roles';

export const metadata: Metadata = { title: 'Sign up' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [{ next }, t] = await Promise.all([searchParams, getTranslations('auth')]);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-bold">{t('signupTitle')}</h1>
        <p className="mt-1 text-stone-400">{t('signupSubtitle')}</p>
      </div>
      <SignupForm next={safeNextPath(typeof next === 'string' ? next : null)} />
    </main>
  );
}
