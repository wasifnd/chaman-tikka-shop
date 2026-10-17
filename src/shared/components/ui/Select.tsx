import { useId, type Ref, type SelectHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ label, error, className, id, ref, children, ...props }: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-stone-200">
        {label}
      </label>
      <select
        id={fieldId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'bg-ash min-h-11 rounded-lg px-3 text-stone-100 ring-1 ring-stone-700',
          'focus-visible:outline-ember focus-visible:outline-2',
          error && 'ring-red-500',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
