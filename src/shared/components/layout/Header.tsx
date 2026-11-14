import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AuthMenu } from '@/features/auth/components/AuthMenu';
import { CartLink } from '@/features/cart/components/CartLink';
import { BrandMark } from '@/shared/components/brand/BrandMark';

const navLink =
  'inline-flex min-h-11 items-center px-3 text-sm font-medium text-stone-200 hover:text-gold focus-visible:outline-2 focus-visible:outline-gold';

export async function Header() {
  const [common, nav] = await Promise.all([getTranslations('common'), getTranslations('nav')]);
  return (
    <header className="bg-char/90 top-0 z-30 backdrop-blur sm:sticky">
      {/* On phones the nav drops to its own row so nothing is squeezed or clipped. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <Link
          href="/"
          className="focus-visible:outline-gold flex items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <BrandMark size="sm" decorative />
          <span className="font-display sr-only text-sm tracking-[0.18em] text-stone-100 uppercase sm:not-sr-only">
            {common('brand')}
          </span>
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
        <div className="flex items-center gap-1">
          <CartLink />
          <AuthMenu />
        </div>
      </div>
      <div aria-hidden="true" className="fire-rule h-0.5" />
    </header>
  );
}
