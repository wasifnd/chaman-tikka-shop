import { cn } from '@/shared/utils/cn';

interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Used for accessible names, e.g. the product being changed. */
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  className?: string;
}

const button =
  'focus-visible:outline-ember inline-flex size-11 items-center justify-center rounded-lg bg-ash text-lg ring-1 ring-stone-700 hover:bg-stone-800 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40';

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  label,
  decreaseLabel,
  increaseLabel,
  className,
}: QuantityStepperProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center gap-2', className)}
    >
      <button
        type="button"
        className={button}
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => {
          onChange(Math.max(min, value - 1));
        }}
      >
        −
      </button>
      <output aria-live="polite" className="min-w-8 text-center font-semibold">
        {value}
      </output>
      <button
        type="button"
        className={button}
        aria-label={increaseLabel}
        disabled={value >= max}
        onClick={() => {
          onChange(Math.min(max, value + 1));
        }}
      >
        +
      </button>
    </div>
  );
}
