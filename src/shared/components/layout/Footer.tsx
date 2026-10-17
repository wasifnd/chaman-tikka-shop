import { getTranslations } from 'next-intl/server';

export async function Footer() {
  const [common, t] = await Promise.all([getTranslations('common'), getTranslations('footer')]);
  return (
    <footer className="mt-16 border-t border-stone-800 py-8 text-sm text-stone-400">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4">
        <p className="font-semibold text-stone-200">
          {common('brand')} · {t('tagline')}
        </p>
        <p>{t('address')}</p>
        <p>{t('hours')}</p>
      </div>
    </footer>
  );
}
