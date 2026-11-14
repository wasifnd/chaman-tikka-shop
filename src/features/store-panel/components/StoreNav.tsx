'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LinkPending } from '@/shared/components/ui/LinkPending';
import { cn } from '@/shared/utils/cn';

const LINKS = [
  { href: '/store/orders', key: 'orders' },
  { href: '/store/counter', key: 'counter' },
  { href: '/store/kitchen', key: 'kitchen' },
  { href: '/store/khata', key: 'khata' },
] as const;

/** The store panel's tabs. Admins also get a way back to the admin panel. */
export function StoreNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const t = useTranslations('store.nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-wrap gap-2">
      {LINKS.map(({ href, key }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'focus-visible:outline-gold inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium focus-visible:outline-2',
              current
                ? 'bg-ember text-white'
                : 'bg-ash text-stone-300 ring-1 ring-stone-700 hover:text-white',
            )}
          >
            {t(key)}
            <LinkPending />
          </Link>
        );
      })}
      {isAdmin ? (
        <Link
          href="/admin"
          className="text-gold focus-visible:outline-gold ring-gold/50 hover:bg-ash inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium whitespace-nowrap ring-1 focus-visible:outline-2"
        >
          {t('admin')}
          <LinkPending />
        </Link>
      ) : null}
    </nav>
  );
}
