'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/cn';

const LINKS = [
  { href: '/store/orders', key: 'orders' },
  { href: '/store/kitchen', key: 'kitchen' },
] as const;

export function StoreNav() {
  const t = useTranslations('store.nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex gap-2">
      {LINKS.map(({ href, key }) => {
        const current = pathname === href;
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
    </nav>
  );
}
