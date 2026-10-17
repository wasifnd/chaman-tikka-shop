import { useId, type Ref, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | undefined;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ label, error, className, id, ref, ...props }: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-stone-200">
        {label}
      </label>
      <textarea
        id={fieldId}
        ref={ref}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'bg-ash rounded-lg px-3 py-2 text-stone-100 ring-1 ring-stone-700 placeholder:text-stone-500',
          'focus-visible:outline-ember focus-visible:outline-2',
          error && 'ring-red-500',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
