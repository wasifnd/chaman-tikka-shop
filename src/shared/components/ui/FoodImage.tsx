import Image from 'next/image';
import { cn } from '@/shared/utils/cn';

interface FoodImageProps {
  src: string | null;
  /** Used as alt text, and for the initial shown when there is no photo yet. */
  name: string;
  /** Tells the browser how wide the image renders so it downloads the right size. */
  sizes: string;
  priority?: boolean;
  className?: string;
}

/** Photo when we have one, otherwise a neutral placeholder. Always reserves its box (no layout shift). */
export function FoodImage({ src, name, sizes, priority = false, className }: FoodImageProps) {
  return (
    <div className={cn('bg-ash relative aspect-4/3 overflow-hidden', className)}>
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="from-ash flex size-full items-center justify-center bg-linear-to-br to-stone-800 text-4xl font-bold text-stone-600"
        >
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}
