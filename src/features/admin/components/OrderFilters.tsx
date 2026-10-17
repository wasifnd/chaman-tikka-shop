import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ORDER_STATUSES, ORDER_TYPES } from '@/features/orders/state-machine';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';

/**
 * The order search is a plain GET form: results live in the address bar, so a search can be
 * bookmarked, shared with a colleague and reloaded, and it needs no client-side code.
 */
export async function OrderFilters({ values }: { values: Record<string, string> }) {
  const t = await getTranslations('admin.orders');
  const status = await getTranslations('admin.orders.status');

  return (
    <form method="get" action="/admin/orders" className="flex flex-wrap items-end gap-3">
      <Input label={t('search')} name="q" type="search" defaultValue={values['q'] ?? ''} />
      <Select label={t('statusLabel')} name="status" defaultValue={values['status'] ?? ''}>
        <option value="">{t('anyStatus')}</option>
        {ORDER_STATUSES.map((value) => (
          <option key={value} value={value}>
            {status(value)}
          </option>
        ))}
      </Select>
      <Select label={t('typeLabel')} name="type" defaultValue={values['type'] ?? ''}>
        <option value="">{t('anyType')}</option>
        {ORDER_TYPES.map((value) => (
          <option key={value} value={value}>
            {t(`type.${value}`)}
          </option>
        ))}
      </Select>
      <Input label={t('from')} name="from" type="date" defaultValue={values['from'] ?? ''} />
      <Input label={t('to')} name="to" type="date" defaultValue={values['to'] ?? ''} />
      <Button type="submit">{t('apply')}</Button>
      <Link href="/admin/orders" className="text-sm text-stone-400 underline">
        {t('clear')}
      </Link>
    </form>
  );
}
