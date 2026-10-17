export interface KeyMemory {
  /** Fingerprint of the request this key was issued for. */
  fingerprint: string;
  key: string;
}

/**
 * The idempotency key for a request. Sending the very same order again (a double click, a retry
 * after a dropped connection) reuses the key so the server can recognise it and return the
 * original order. Changing anything about the order issues a new key, since it is a different order.
 */
export function keyFor(
  memory: KeyMemory | null,
  fingerprint: string,
  generate: () => string,
): KeyMemory {
  return memory?.fingerprint === fingerprint ? memory : { fingerprint, key: generate() };
}

/** Pulls the tracking token out of a successful order response, or throws if it is malformed. */
export function readTrackingToken(data: unknown): string {
  const token = (data as { order?: { trackingToken?: unknown } } | null)?.order?.trackingToken;
  if (typeof token !== 'string' || token === '') throw new Error('Unexpected order response');
  return token;
}
