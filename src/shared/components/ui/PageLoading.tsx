import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';

interface PageLoadingProps {
  /** What is being loaded, said out loud to screen readers and shown beside the spinner. */
  label: string;
  /** The rough shape of the page, so the content lands where the placeholders were. */
  shape?: 'list' | 'cards' | 'panels';
}

/**
 * Shown the moment a link is clicked while the next page is fetched, so navigation always
 * answers at once. The placeholders follow the page's layout instead of being plain boxes.
 */
export function PageLoading({ label, shape = 'list' }: PageLoadingProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5">
      <p className="text-gold flex items-center gap-2 text-sm">
        <Spinner />
        {label}
      </p>
      <Skeleton className="h-8 w-56" />
      {shape === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="bg-ash/60 flex flex-col gap-3 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : shape === 'panels' ? (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <BoardColumnSkeleton key={n} cards={n === 0 ? 2 : 1} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-ash/60 flex items-center justify-between gap-4 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-9 w-24" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One store-board column while orders load: a header and order-shaped cards. */
export function BoardColumnSkeleton({ cards = 1 }: { cards?: number }) {
  return (
    <div className="bg-char/40 flex flex-col gap-3 rounded-2xl p-3 ring-1 ring-stone-800">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-6 w-8 rounded-full" />
      </div>
      {Array.from({ length: cards }, (_, n) => (
        <div key={n} className="bg-ash flex flex-col gap-3 rounded-xl p-4 ring-1 ring-stone-700">
          <div className="flex justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  );
}
