import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { formatPrice } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import type { KhataDetail } from '../types/khata.types';
import { KhataActions } from './KhataActions';
import { KhataEntries } from './KhataEntries';

interface KhataDetailViewProps {
  khata: KhataDetail;
  /** The list this page belongs to, for the back link. */
  basePath: string;
  isAdmin: boolean;
  defaultLimit: number;
}

const linkClass =
  'text-gold focus-visible:outline-gold inline-flex min-h-11 items-center underline focus-visible:outline-2';

/** One customer's khata for staff and admin: what they owe, what can be done, and the history. */
export async function KhataDetailView({
  khata,
  basePath,
  isAdmin,
  defaultLimit,
}: KhataDetailViewProps) {
  const t = await getTranslations('khata');
  const statement = `/api/v1/store/khata/${khata.id}/statement`;

  return (
    <div className="flex flex-col gap-6">
      <p>
        <Link href={basePath} className="text-gold underline">
          {t('back')}
        </Link>
      </p>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-gold text-3xl">{khata.name}</h2>
          <p className="text-stone-300 tabular-nums">{khata.phone}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-right">
          <dt className="text-stone-400">{t('owes')}</dt>
          <dd
            className={cn('text-2xl font-bold', khata.balance > 0 ? 'text-gold' : 'text-green-400')}
          >
            {formatPrice(khata.balance)}
          </dd>
          <dt className="text-stone-400">{t('limit')}</dt>
          <dd>
            {formatPrice(khata.limit)}
            {khata.creditLimit === null ? '' : ` (${t('ownLimit')})`}
          </dd>
        </dl>
      </header>

      <div className="flex flex-wrap gap-4">
        <a href={statement} className={linkClass}>
          {t('statementPdf')}
        </a>
        <a href={`${statement}?format=csv`} className={linkClass}>
          {t('statementCsv')}
        </a>
      </div>

      <KhataActions
        khataId={khata.id}
        balance={khata.balance}
        creditLimit={khata.creditLimit}
        defaultLimit={defaultLimit}
        isAdmin={isAdmin}
      />

      <section aria-labelledby="khata-history">
        <h3 id="khata-history" className="mb-2 text-lg font-semibold">
          {t('history')}
        </h3>
        <KhataEntries entries={khata.entries} audience="staff" />
      </section>
    </div>
  );
}
