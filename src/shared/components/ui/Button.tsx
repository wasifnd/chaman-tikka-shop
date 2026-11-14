import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-ember text-white hover:bg-ember-deep',
  secondary: 'bg-ash text-stone-100 ring-1 ring-gold/40 hover:bg-stone-800 hover:ring-gold/70',
  ghost: 'text-stone-300 hover:bg-ash hover:text-white',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors',
        'focus-visible:outline-gold focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
