import type { Metadata } from 'next';
import { KhataListPage } from '@/features/khata/pages';

export const metadata: Metadata = { title: 'Khata' };

export default function StoreKhataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <KhataListPage searchParams={searchParams} basePath="/store/khata" />;
}
