import type { ApiError } from '@/shared/utils/api';

/**
 * Splits a server error into per-field messages (shown under inputs) and a general
 * message (shown in an alert). Details for unknown fields fall back to the general message.
 */
export function splitApiError(error: ApiError, fields: readonly string[]) {
  const fieldErrors = Object.entries(error.details ?? {}).filter(([name]) => fields.includes(name));
  return {
    fieldErrors: fieldErrors.map(([name, message]) => ({ name, message })),
    formError: fieldErrors.length > 0 ? null : error.message,
  };
}
