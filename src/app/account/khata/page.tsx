import { getTranslations } from 'next-intl/server';
import { KhataEntries } from '@/features/khata/components/KhataEntries';
import { khataRepository } from '@/features/khata/server';
import { getSession } from '@/lib/auth/session';
import { formatPrice } from '@/shared/utils/format';

export const metadata = { title: 'My khata' };

const linkClass =
  'text-gold focus-visible:outline-gold inline-flex min-h-11 items-center underline focus-visible:outline-2';

/** The customer's own khata: what they owe and every entry. Read-only. */
export default async function AccountKhataPage() {
  const session = await getSession();
  // The layout has already checked this; it is repeated so this page can never run without it.
  if (!session) return null;
  const [t, khata] = await Promise.all([
    getTranslations('khata.mine'),
    khataRepository.findForUser(session.userId),
  ]);

  return (
    <>
      <h2 className="mb-1 text-xl font-semibold">{t('title')}</h2>
      <p className="mb-5 text-sm text-stone-400">{t('hint')}</p>
      {khata ? (
        <div className="flex flex-col gap-5">
          <dl className="bg-ash grid grid-cols-2 gap-y-1 rounded-xl p-4 sm:max-w-sm">
            <dt className="text-stone-400">{t('owe')}</dt>
            <dd className="text-gold text-right text-2xl font-bold">
              {formatPrice(khata.balance)}
            </dd>
            <dt className="text-stone-400">{t('limit')}</dt>
            <dd className="text-right">{formatPrice(khata.limit)}</dd>
          </dl>
          <div className="flex flex-wrap gap-4">
            <a href="/api/v1/account/khata/statement" className={linkClass}>
              {t('statementPdf')}
            </a>
            <a href="/api/v1/account/khata/statement?format=csv" className={linkClass}>
              {t('statementCsv')}
            </a>
          </div>
          <KhataEntries entries={khata.entries} audience="customer" />
        </div>
      ) : (
        <p className="text-stone-300">{t('none')}</p>
      )}
    </>
  );
}
