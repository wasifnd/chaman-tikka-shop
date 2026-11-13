import { useId, type InputHTMLAttributes, type Ref } from 'react';
import { cn } from '@/shared/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  /** A short line under the field saying what it is for. */
  hint?: string | undefined;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ label, error, hint, className, id, ref, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-stone-200">
        {label}
      </label>
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'bg-ash min-h-11 rounded-lg px-3 text-stone-100 ring-1 ring-stone-700 placeholder:text-stone-500',
          'focus-visible:outline-ember focus-visible:outline-2',
          error && 'ring-red-500',
          className,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-stone-400">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
