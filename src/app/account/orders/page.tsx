import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { OrderHistory } from '@/features/account/components/OrderHistory';
import { account } from '@/features/account/server';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'My orders' };

const pageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  // The layout has already checked this; it is repeated so this page can never run without it.
  if (!session?.customerId) return null;

  const raw = (await searchParams)['page'];
  const page = pageSchema.parse(Array.isArray(raw) ? raw[0] : raw);

  const [t, history] = await Promise.all([
    getTranslations('account.orders'),
    account.listOrders(session.customerId, page),
  ]);
  return (
    <>
      <h2 className="mb-1 text-xl font-semibold">{t('title')}</h2>
      <p className="mb-5 text-sm text-stone-400">{t('hint')}</p>
      <OrderHistory history={history} />
    </>
  );
}
