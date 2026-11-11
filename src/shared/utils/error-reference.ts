/**
 * The short code Next attaches to a server error (error.digest). It is safe to show: it reveals
 * nothing about the failure, but lets whoever runs the site find the matching line in the logs.
 * Errors thrown in the browser carry no digest, and anything that is not an Error has none.
 */
export function errorReference(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const digest = (error as Error & { digest?: unknown }).digest;
  return typeof digest === 'string' && digest !== '' ? digest : null;
}
