import { getTranslations } from 'next-intl/server';
import { BrandMark } from '@/shared/components/brand/BrandMark';

export async function Footer() {
  const [common, t] = await Promise.all([getTranslations('common'), getTranslations('footer')]);
  return (
    <footer className="mt-16 text-sm text-stone-400">
      <div aria-hidden="true" className="fire-rule h-0.5" />
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-stone-200">
            {common('brand')} · {t('tagline')}
          </p>
          <p>{t('address')}</p>
          <p>{t('hours')}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <BrandMark size="sm" decorative />
          <p lang="ur" dir="rtl" className="font-display text-gold text-lg">
            {t('taglineUrdu')}
          </p>
        </div>
      </div>
    </footer>
  );
}
