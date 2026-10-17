import type { Metadata } from 'next';
import { StoreBoard } from '@/features/store-panel/components/StoreBoard';

export const metadata: Metadata = { title: 'Store orders' };

export default function StoreOrdersPage() {
  return <StoreBoard />;
}
