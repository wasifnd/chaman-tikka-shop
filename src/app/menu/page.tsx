import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MenuBrowser } from '@/features/menu/components/MenuBrowser';
import { getMenu } from '@/features/menu/server';

// Next reads this at build time, so it has to be a literal (matches MENU_REVALIDATE_SECONDS).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Menu',
  description: 'Browse the full BBQ Store menu: tikka, kababs, chops, fresh naan and drinks.',
  alternates: { canonical: '/menu' },
};

export default async function MenuPage() {
  const [categories, t] = await Promise.all([getMenu(), getTranslations('menu')]);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-1 mb-6 text-stone-400">{t('subtitle')}</p>
      <MenuBrowser categories={categories} />
    </main>
  );
}
