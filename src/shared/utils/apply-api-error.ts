import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ApiError } from '@/shared/utils/api';

/**
 * Puts the server's per-field messages under the matching inputs (field paths like
 * "variantGroups.0.variants.1.nameEn" match the form's own) and returns the general message
 * to show above the form.
 */
export function applyApiError<T extends FieldValues>(
  error: ApiError,
  setError: UseFormSetError<T>,
): string {
  for (const [name, message] of Object.entries(error.details ?? {})) {
    setError(name as Path<T>, { message });
  }
  return error.message;
}
