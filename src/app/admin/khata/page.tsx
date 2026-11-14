import type { Metadata } from 'next';
import { KhataListPage } from '@/features/khata/pages';

export const metadata: Metadata = { title: 'Admin khata' };

export default function AdminKhataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <KhataListPage searchParams={searchParams} basePath="/admin/khata" />;
}
