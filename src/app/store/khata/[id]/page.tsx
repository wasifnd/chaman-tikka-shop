import type { Metadata } from 'next';
import { KhataDetailPage } from '@/features/khata/pages';

export const metadata: Metadata = { title: 'Khata' };

export default function StoreKhataDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <KhataDetailPage params={params} basePath="/store/khata" />;
}
