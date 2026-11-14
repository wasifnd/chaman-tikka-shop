import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-20">
      <h1 className="font-display text-gold text-4xl tracking-wide">{t('title')}</h1>
      <p className="text-stone-400">{t('body')}</p>
      <Link
        href="/menu"
        className="bg-ember hover:bg-ember-deep inline-flex min-h-11 items-center rounded-lg px-4 font-semibold text-white"
      >
        {t('cta')}
      </Link>
    </main>
  );
}
