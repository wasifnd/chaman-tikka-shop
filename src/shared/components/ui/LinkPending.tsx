'use client';

import { useLinkStatus } from 'next/link';
import { cn } from '@/shared/utils/cn';
import { Spinner } from './Spinner';

/**
 * Put inside a `<Link>`: a small spinner that turns while that link's page is on its way, so a
 * click always answers at once, even on pages that can't show a loading screen (detail pages
 * that must be able to answer "not found" with a real 404). Always rendered, only shown while
 * pending, so the link never changes size.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return <Spinner className={cn('ml-2', pending ? 'visible' : 'invisible', className)} />;
}
