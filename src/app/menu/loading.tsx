import { Skeleton } from '@/shared/components/ui/Skeleton';

export default function MenuLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8" aria-busy="true">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-6 h-11 w-full" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-4/5" />
        ))}
      </div>
    </main>
  );
}
