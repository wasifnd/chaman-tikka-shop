import { cn } from '@/shared/utils/cn';

/** The shop's name as written on its signboard. */
export const BRAND_URDU = 'چمن تکہ شاپ';

/**
 * The signboard's wordmark: the Urdu name in yellow on a red brush stroke. Decorative copies can
 * hide it from screen readers; where it names the shop, give the English name nearby.
 */
export function BrandMark({
  size = 'md',
  className,
  decorative = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  decorative?: boolean;
}) {
  return (
    <span
      lang="ur"
      dir="rtl"
      aria-hidden={decorative || undefined}
      className={cn(
        'brush-stroke font-display text-gold sign-shadow inline-block leading-none whitespace-nowrap',
        size === 'sm' && 'px-3 pt-2 pb-1.5 text-xl',
        size === 'md' && 'px-4 pt-2.5 pb-2 text-2xl sm:text-3xl',
        size === 'lg' && 'px-6 pt-4 pb-3 text-5xl sm:text-7xl',
        className,
      )}
    >
      {BRAND_URDU}
    </span>
  );
}

/** A section title in the sign's yellow, with a short flame underline. */
export function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-display text-gold mb-4 text-3xl tracking-wide">
      {children}
      <span
        aria-hidden="true"
        className="from-ember via-flame to-gold mt-1 block h-1 w-16 rounded-full bg-linear-to-r"
      />
    </h2>
  );
}
