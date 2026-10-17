import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AuthMenu } from '@/features/auth/components/AuthMenu';

export async function Header() {
  const t = await getTranslations('common');
  return (
    <header className="border-b border-stone-800">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {t('brand')}
        </Link>
        <AuthMenu />
      </div>
    </header>
  );
}
