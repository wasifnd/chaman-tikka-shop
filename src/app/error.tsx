'use client';

import { ErrorPanel } from '@/shared/components/errors/ErrorPanel';

export default function SiteError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} area="site" homeHref="/menu" />;
}
