import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { formatPrice } from '@/shared/utils/format';
import type { KhataPage } from '../types/khata.types';

interface KhataListProps {
  page: KhataPage;
  /** Where the list lives: /store/khata for staff, /admin/khata for admin. */
  basePath: string;
  search: string;
  showAll: boolean;
}

function href(basePath: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Everyone who owes the shop, biggest balance first, with a search by number or name. */
export async function KhataList({ page, basePath, search, showAll }: KhataListProps) {
  const t = await getTranslations('khata');
  const kept = { ...(search ? { q: search } : {}), ...(showAll ? { all: '1' } : {}) };
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));

  return (
    <div className="flex flex-col gap-4">
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-3" role="search">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="khata-search" className="text-sm font-medium text-stone-200">
            {t('search')}
          </label>
          <input
            id="khata-search"
            name="q"
            type="search"
            defaultValue={search}
            className="bg-ash focus-visible:outline-gold min-h-11 rounded-lg px-3 ring-1 ring-stone-700 focus-visible:outline-2"
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="all" value="1" defaultChecked={showAll} className="size-5" />
          {t('showPaidUp')}
        </label>
        <button
          type="submit"
          className="bg-ember hover:bg-ember-deep focus-visible:outline-gold min-h-11 rounded-lg px-4 text-sm font-semibold text-white focus-visible:outline-2"
        >
          {t('find')}
        </button>
      </form>

      <p className="text-lg" role="status">
        {t('totalOwed', { amount: formatPrice(page.totalOwed), count: page.total })}
      </p>

      {page.items.length === 0 ? (
        <p className="text-stone-400">{search ? t('noMatch') : t('nobodyOwes')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-stone-400">
              <tr>
                <th scope="col" className="py-2 pr-3">
                  {t('customer')}
                </th>
                <th scope="col" className="py-2 pr-3">
                  {t('phone')}
                </th>
                <th scope="col" className="py-2 pr-3 text-right">
                  {t('owes')}
                </th>
                <th scope="col" className="py-2 text-right">
                  {t('limit')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800">
              {page.items.map((khata) => (
                <tr key={khata.id}>
                  <td className="py-2 pr-3">
                    <Link href={`${basePath}/${khata.id}`} className="text-gold underline">
                      {khata.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{khata.phone}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                    {formatPrice(khata.balance)}
                  </td>
                  <td className="py-2 text-right text-stone-400 tabular-nums">
                    {formatPrice(khata.limit)}
                    {khata.creditLimit === null ? '' : ` (${t('ownLimit')})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label={t('pages')} className="flex items-center justify-between">
          {page.page > 1 ? (
            <Link
              className="text-gold underline"
              href={href(basePath, { ...kept, page: String(page.page - 1) })}
            >
              {t('previous')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-stone-400">{t('pageOf', { page: page.page, pages })}</span>
          {page.page < pages ? (
            <Link
              className="text-gold underline"
              href={href(basePath, { ...kept, page: String(page.page + 1) })}
            >
              {t('next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
