'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';

const LINKS = [
  { href: '/admin', key: 'dashboard' },
  { href: '/admin/orders', key: 'orders' },
  { href: '/admin/menu', key: 'menu' },
  { href: '/admin/categories', key: 'categories' },
  { href: '/admin/addons', key: 'addons' },
  { href: '/admin/deals', key: 'deals' },
  { href: '/admin/delivery', key: 'delivery' },
  { href: '/admin/coupons', key: 'coupons' },
  { href: '/admin/settings', key: 'settings' },
  { href: '/admin/team', key: 'team' },
] as const;

/** The dashboard link matches only itself; the others also match their sub-pages. */
export function isCurrent(pathname: string, href: string): boolean {
  return href === '/admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-wrap gap-2">
      {LINKS.map(({ href, key }) => {
        const current = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'focus-visible:outline-ember inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium focus-visible:outline-2',
              current
                ? 'bg-ember text-white'
                : 'bg-ash text-stone-300 ring-1 ring-stone-700 hover:text-white',
            )}
          >
            {t(key)}
          </Link>
        );
      })}
      <Link
        href="/store/orders"
        className="focus-visible:outline-ember inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-stone-400 underline focus-visible:outline-2"
      >
        {t('storePanel')}
      </Link>
    </nav>
  );
}
