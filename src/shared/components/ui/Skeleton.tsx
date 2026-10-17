import { cn } from '@/shared/utils/cn';

/** Placeholder block. Give it explicit dimensions so loading never shifts the layout. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('bg-ash animate-pulse rounded-lg', className)} />;
}
