// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '../testing/fake-event-source';
import type { StaffEventPayload } from '../types/staff-order.types';
import { useStoreStream } from './useStoreStream';

const payload = (status: string, orderNumber = 'BBQ-2026-0001') => ({
  orderId: 'o1',
  orderNumber,
  status,
  at: '2026-10-16T14:00:00.000Z',
});

let refreshAnswers: number[] = [];
const fetchMock = vi.fn((input: string) =>
  Promise.resolve(
    new Response('{}', {
      status: input === '/api/auth/refresh' ? (refreshAnswers.shift() ?? 200) : 200,
    }),
  ),
);

beforeEach(() => {
  FakeEventSource.reset();
  refreshAnswers = [];
  fetchMock.mockClear();
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(afterId: number | null = 10) {
  const events: [number, StaffEventPayload][] = [];
  const hook = renderHook(
    ({ id }: { id: number | null }) =>
      useStoreStream({ afterId: id, onEvent: (eventId, p) => events.push([eventId, p]) }),
    { initialProps: { id: afterId } },
  );
  return { ...hook, events };
}

describe('connecting', () => {
  it('stays off until the first load says where "now" is', () => {
    const { rerender } = setup(null);
    expect(FakeEventSource.instances).toHaveLength(0);
    rerender({ id: 7 });
    expect(FakeEventSource.last.url).toBe('/api/v1/store/events?after=7');
  });

  it('starts after the position the first load reported', () => {
    setup(42);
    expect(FakeEventSource.last.url).toBe('/api/v1/store/events?after=42');
  });

  it('becomes live when the connection opens', () => {
    const { result } = setup();
    expect(result.current).toBe('connecting');
    act(() => {
      FakeEventSource.last.open();
    });
    expect(result.current).toBe('live');
  });

  it('does not reconnect just because the loaded position moves on later', () => {
    const { rerender } = setup(10);
    rerender({ id: 99 });
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('closes the connection when the screen goes away', () => {
    const { unmount } = setup();
    const connection = FakeEventSource.last;
    unmount();
    expect(connection.closed).toBe(true);
  });
});

describe('events', () => {
  it('hands each event to the screen with its id', () => {
    const { events } = setup();
    act(() => {
      FakeEventSource.last.send(11, payload('RECEIVED'), 'order.created');
      FakeEventSource.last.send(12, payload('CONFIRMED'));
    });
    expect(events.map(([id, p]) => [id, p.type, p.status])).toEqual([
      [11, 'order.created', 'RECEIVED'],
      [12, 'order.status_changed', 'CONFIRMED'],
    ]);
  });

  it('ignores malformed messages', () => {
    const { events } = setup();
    act(() => {
      FakeEventSource.last.emit('order.created', '{broken', '11');
    });
    expect(events).toHaveLength(0);
  });
});

describe('trouble with the connection', () => {
  it('says nothing for the single drop the server causes by renewing the stream', () => {
    const { result } = setup();
    act(() => {
      FakeEventSource.last.open();
      FakeEventSource.last.dropAndRetry();
    });
    expect(result.current).toBe('live');
  });

  it('reports reconnecting, then offline, as failures repeat, and recovers when it reopens', () => {
    const { result } = setup();
    const connection = FakeEventSource.last;
    act(() => {
      connection.dropAndRetry();
      connection.dropAndRetry();
    });
    expect(result.current).toBe('reconnecting');
    act(() => {
      connection.dropAndRetry();
    });
    expect(result.current).toBe('offline');
    act(() => {
      connection.open();
    });
    expect(result.current).toBe('live');
  });
});

describe('when the login expires during a long shift', () => {
  it('renews the login and reconnects from where it left off', async () => {
    const { result } = setup(10);
    act(() => {
      FakeEventSource.last.open();
      FakeEventSource.last.send(14, payload('CONFIRMED'));
    });
    const first = FakeEventSource.last;

    await act(async () => {
      first.refuse(); // 401: the browser will not retry
      await Promise.resolve();
    });
    expect(first.closed).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current).toBe('reconnecting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    // It resumes after the newest event already seen, so nothing is missed or repeated.
    expect(FakeEventSource.last.url).toBe('/api/v1/store/events?after=14');

    act(() => {
      FakeEventSource.last.open();
    });
    expect(result.current).toBe('live');
  });

  it('reports signed out when the login cannot be renewed, and does not keep trying', async () => {
    refreshAnswers = [401];
    const { result } = setup();
    await act(async () => {
      FakeEventSource.last.refuse();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current).toBe('signedOut');
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('waits longer each time the server keeps refusing', async () => {
    setup();
    const refuseAndWait = async (delay: number) => {
      await act(async () => {
        FakeEventSource.last.refuse();
        await Promise.resolve();
      });
      const before = FakeEventSource.instances.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay - 1);
      });
      expect(FakeEventSource.instances).toHaveLength(before); // not yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(FakeEventSource.instances).toHaveLength(before + 1);
    };
    await refuseAndWait(3000);
    await refuseAndWait(6000);
    await refuseAndWait(12_000);
  });

  it('starts the backoff over once a connection succeeds', async () => {
    setup();
    await act(async () => {
      FakeEventSource.last.refuse();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    act(() => {
      FakeEventSource.last.open();
    });
    await act(async () => {
      FakeEventSource.last.refuse();
      await Promise.resolve();
    });
    const before = FakeEventSource.instances.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(FakeEventSource.instances).toHaveLength(before + 1);
  });

  it('does not reconnect after the screen has gone away', async () => {
    const { unmount } = setup();
    await act(async () => {
      FakeEventSource.last.refuse();
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
