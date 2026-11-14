import type { Metadata } from 'next';
import { getCounterMenu } from '@/features/menu/server';
import { CounterView } from '@/features/store-panel/counter/CounterView';

export const metadata: Metadata = { title: 'Counter' };

/** The cashier's screen for takeaway and dine-in orders taken at the counter. */
export default async function CounterPage() {
  return <CounterView menu={await getCounterMenu()} />;
}
