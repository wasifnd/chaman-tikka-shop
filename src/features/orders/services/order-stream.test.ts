import { describe, expect, it, vi } from 'vitest';
import {
  formatEvent,
  orderEventFrames,
  parseResumePosition,
  type StreamDeps,
  type StreamEvent,
} from './order-stream';

const event = (id: number, type = 'order.status_changed'): StreamEvent => ({
  id,
  type,
  payload: { status: 'PREPARING', id },
});

/** A fake clock that only moves when the stream sleeps. */
function harness(batches: StreamEvent[][], extra: Partial<StreamDeps> = {}) {
  let time = 0;
  const calls: number[] = [];
  const remaining = [...batches];
  const deps: StreamDeps = {
    fetchEvents: (afterId) => {
      calls.push(afterId);
      return Promise.resolve(remaining.shift() ?? []);
    },
    sleep: (ms) => {
      time += ms;
      return Promise.resolve();
    },
    now: () => time,
    aborted: () => false,
    ...extra,
  };
  return { deps, calls };
}

async function collect(generator: AsyncGenerator<string>) {
  const frames: string[] = [];
  for await (const frame of generator) frames.push(frame);
  return frames;
}

describe('formatEvent', () => {
  it('writes id, event name and JSON data in Server-Sent Events format', () => {
    expect(formatEvent(event(7))).toBe(
      'id: 7\nevent: order.status_changed\ndata: {"status":"PREPARING","id":7}\n\n',
    );
  });

  it('keeps newlines inside data from breaking the frame', () => {
    const frame = formatEvent({ id: 1, type: 'x', payload: { note: 'a\nb' } });
    expect(frame.split('\n\n')).toHaveLength(2); // exactly one frame
    expect(frame).toContain('a\\nb');
  });
});

describe('orderEventFrames', () => {
  it('starts by telling the browser how long to wait before reconnecting', async () => {
    const { deps } = harness([]);
    const frames = await collect(orderEventFrames(0, deps, { maxMs: 1000, pollMs: 500 }));
    expect(frames[0]).toBe('retry: 3000\n\n');
  });

  it('delivers events in order and resumes after the last one it sent', async () => {
    const { deps, calls } = harness([[event(1), event(2)], [], [event(3)]]);
    const frames = await collect(orderEventFrames(0, deps, { maxMs: 4000, pollMs: 1000 }));
    expect(frames.filter((f) => f.startsWith('id:')).map((f) => f.split('\n')[0])).toEqual([
      'id: 1',
      'id: 2',
      'id: 3',
    ]);
    // Each poll asks only for what is newer than what was already sent.
    expect(calls.slice(0, 3)).toEqual([0, 2, 2]);
  });

  it('starts from the position a reconnecting browser reports', async () => {
    const { deps, calls } = harness([[event(11)]]);
    await collect(orderEventFrames(10, deps, { maxMs: 1000, pollMs: 1000 }));
    expect(calls[0]).toBe(10);
  });

  it('ends after the connection lifetime so the browser can reconnect', async () => {
    const { deps, calls } = harness([]);
    await collect(orderEventFrames(0, deps, { maxMs: 5000, pollMs: 1000 }));
    expect(calls).toHaveLength(5);
  });

  it('sends a keep-alive when quiet for a while, then stays quiet until the next interval', async () => {
    const { deps } = harness([]);
    const frames = await collect(
      orderEventFrames(0, deps, { maxMs: 10_000, pollMs: 1000, heartbeatMs: 3000 }),
    );
    const beats = frames.filter((f) => f === ': keep-alive\n\n');
    expect(beats.length).toBeGreaterThanOrEqual(2);
    expect(beats.length).toBeLessThanOrEqual(4);
  });

  it('does not send a keep-alive right after real data', async () => {
    const { deps } = harness([[event(1)]]);
    const frames = await collect(
      orderEventFrames(0, deps, { maxMs: 2000, pollMs: 1000, heartbeatMs: 1500 }),
    );
    expect(frames[1]?.startsWith('id: 1')).toBe(true);
    expect(frames).not.toContain(': keep-alive\n\n');
  });

  it('stops promptly when the browser disconnects', async () => {
    let polls = 0;
    const { deps } = harness([], {
      fetchEvents: () => {
        polls += 1;
        return Promise.resolve([]);
      },
      aborted: () => polls >= 2,
    });
    const frames = await collect(orderEventFrames(0, deps, { maxMs: 60_000, pollMs: 1000 }));
    expect(polls).toBe(2);
    expect(frames).toEqual(['retry: 3000\n\n']);
  });

  it('ends quietly instead of crashing when the database fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps } = harness([], { fetchEvents: () => Promise.reject(new Error('db down')) });
    const frames = await collect(orderEventFrames(0, deps));
    expect(frames).toEqual(['retry: 3000\n\n']);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('keeps events already delivered when a later poll fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let first = true;
    const { deps } = harness([], {
      fetchEvents: () => {
        if (first) {
          first = false;
          return Promise.resolve([event(1)]);
        }
        return Promise.reject(new Error('blip'));
      },
    });
    const frames = await collect(orderEventFrames(0, deps, { pollMs: 100 }));
    expect(frames.some((f) => f.startsWith('id: 1'))).toBe(true);
    spy.mockRestore();
  });
});

describe('parseResumePosition', () => {
  it('prefers the Last-Event-ID header, then the query value', () => {
    expect(parseResumePosition('12', '5')).toBe(12);
    expect(parseResumePosition(null, '5')).toBe(5);
  });

  it('falls back to the start for missing or invalid values', () => {
    expect(parseResumePosition(null, null)).toBe(0);
    expect(parseResumePosition('abc', null)).toBe(0);
    expect(parseResumePosition('-3', null)).toBe(0);
    expect(parseResumePosition('1.5', null)).toBe(0);
  });

  it('skips an invalid header in favour of a valid query value', () => {
    expect(parseResumePosition('garbage', '9')).toBe(9);
  });
});
