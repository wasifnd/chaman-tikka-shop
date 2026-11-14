import type { Metadata } from 'next';
import { KhataDetailPage } from '@/features/khata/pages';

export const metadata: Metadata = { title: 'Admin khata' };

export default function AdminKhataDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <KhataDetailPage params={params} basePath="/admin/khata" />;
}
