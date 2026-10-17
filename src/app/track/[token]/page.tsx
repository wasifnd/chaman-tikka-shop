import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { OrderTracker } from '@/features/orders/components/OrderTracker';
import { getOrderRepository } from '@/features/orders/server';

// Orders are live and private: never cache the page, never index it, and don't leak the link in
// the Referer header when someone follows a link off this page.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function TrackOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ placed?: string | string[] }>;
}) {
  const [{ token }, { placed }] = await Promise.all([params, searchParams]);
  const parsed = z.uuid().safeParse(token);
  const snapshot = parsed.success ? await getOrderRepository().findSnapshot(parsed.data) : null;
  if (!parsed.success || !snapshot) notFound();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <OrderTracker token={parsed.data} snapshot={snapshot} justPlaced={placed === '1'} />
    </main>
  );
}
