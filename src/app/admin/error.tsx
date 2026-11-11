'use client';

import { ErrorPanel } from '@/shared/components/errors/ErrorPanel';

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} area="admin" homeHref="/admin" />;
}
