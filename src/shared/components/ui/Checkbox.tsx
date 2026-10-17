import { useId, type InputHTMLAttributes, type Ref } from 'react';
import { cn } from '@/shared/utils/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  ref?: Ref<HTMLInputElement>;
}

/** A tick box with a large tap area, since it is used on phones in the kitchen as well. */
export function Checkbox({ label, className, id, ref, ...props }: CheckboxProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2 text-sm text-stone-200',
        className,
      )}
    >
      <input
        id={fieldId}
        ref={ref}
        type="checkbox"
        className="accent-ember focus-visible:outline-ember size-5 focus-visible:outline-2"
        {...props}
      />
      {label}
    </label>
  );
}
