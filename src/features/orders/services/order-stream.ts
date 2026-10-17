export interface StreamEvent {
  id: number;
  type: string;
  payload: unknown;
}

export interface StreamDeps {
  /** Events for this order with an id greater than `afterId`, oldest first. */
  fetchEvents(afterId: number): Promise<StreamEvent[]>;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** True once the browser has gone away. */
  aborted(): boolean;
}

export interface StreamOptions {
  /** How often to look for new events. */
  pollMs?: number;
  /** How long one connection lasts. The browser then reconnects and continues where it left off. */
  maxMs?: number;
  /** Quiet period after which a comment is sent so proxies don't close an idle connection. */
  heartbeatMs?: number;
}

/** One Server-Sent Event. The `id` lets a reconnecting browser say where it stopped. */
export function formatEvent({ id, type, payload }: StreamEvent): string {
  return `id: ${String(id)}\nevent: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Frames to write to a Server-Sent Events response.
 *
 * Serverless functions can't stay open for ever, so each connection lives for a short while and
 * then ends; browsers reconnect on their own, sending the id of the last event they saw, and the
 * stream resumes from there. No event is lost across reconnects.
 */
export async function* orderEventFrames(
  afterId: number,
  deps: StreamDeps,
  { pollMs = 1500, maxMs = 25_000, heartbeatMs = 15_000 }: StreamOptions = {},
): AsyncGenerator<string> {
  const started = deps.now();
  let lastWrite = started;
  let cursor = afterId;

  // Ask the browser to wait 3 seconds before reconnecting when this connection ends.
  yield 'retry: 3000\n\n';

  while (!deps.aborted() && deps.now() - started < maxMs) {
    let events: StreamEvent[];
    try {
      events = await deps.fetchEvents(cursor);
    } catch (error) {
      // A database hiccup should not kill the page: end this connection, the browser reconnects.
      console.error('Order event stream could not read events', error);
      return;
    }

    for (const event of events) {
      cursor = event.id;
      yield formatEvent(event);
      lastWrite = deps.now();
    }

    if (deps.now() - lastWrite >= heartbeatMs) {
      yield ': keep-alive\n\n';
      lastWrite = deps.now();
    }
    await deps.sleep(pollMs);
  }
}

/** The position to resume from: the browser's Last-Event-ID header, else an `after` query value. */
export function parseResumePosition(header: string | null, query: string | null): number {
  for (const candidate of [header, query]) {
    if (candidate === null) continue;
    const value = Number(candidate);
    if (Number.isInteger(value) && value >= 0) return value;
  }
  return 0;
}
