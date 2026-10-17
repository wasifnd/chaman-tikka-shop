import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AuthMenu } from '@/features/auth/components/AuthMenu';

const navLink =
  'inline-flex min-h-11 items-center px-3 text-sm text-stone-300 hover:text-white focus-visible:outline-2 focus-visible:outline-ember';

export async function Header() {
  const [common, nav] = await Promise.all([getTranslations('common'), getTranslations('nav')]);
  return (
    <header className="border-b border-stone-800">
      {/* On phones the nav drops to its own row so nothing is squeezed or clipped. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 px-4 py-2">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {common('brand')}
        </Link>
        <nav
          aria-label={nav('primary')}
          className="order-3 flex w-full gap-1 sm:order-none sm:w-auto"
        >
          <Link href="/menu" className={navLink}>
            {nav('menu')}
          </Link>
          <Link href="/deals" className={navLink}>
            {nav('deals')}
          </Link>
        </nav>
        <AuthMenu />
      </div>
    </header>
  );
}
