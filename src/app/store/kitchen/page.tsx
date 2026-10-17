import type { Metadata } from 'next';
import { KitchenDisplay } from '@/features/store-panel/components/KitchenDisplay';

export const metadata: Metadata = { title: 'Kitchen' };

export default function KitchenPage() {
  return <KitchenDisplay />;
}
