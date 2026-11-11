'use client';

import { ErrorPanel } from '@/shared/components/errors/ErrorPanel';

export default function StoreError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} area="store" homeHref="/store/orders" />;
}
