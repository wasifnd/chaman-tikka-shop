import { Skeleton } from '@/shared/components/ui/Skeleton';

export default function ProductLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8" aria-busy="true">
      <Skeleton className="h-5 w-32" />
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <Skeleton className="aspect-4/3" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </main>
  );
}
