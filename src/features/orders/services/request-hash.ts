import { createHash } from 'node:crypto';

/** JSON with object keys sorted, so the same data always serialises to the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  // JSON.stringify(undefined) is undefined at runtime even though its type says string.
  return value === undefined ? 'null' : JSON.stringify(value);
}

/** A fingerprint of an order request, used to tell a retry from a different order. */
export function hashRequest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
