// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-16T14:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('starts from the time the server gave, not the browser clock', () => {
    const { result } = renderHook(() => useNow('2026-10-16T13:00:00.000Z'));
    expect(result.current).toBe(new Date('2026-10-16T13:00:00.000Z').getTime());
  });

  it('moves forward on its interval', () => {
    const { result } = renderHook(() => useNow('2026-10-16T13:00:00.000Z', 1000));
    act(() => {
      vi.setSystemTime(new Date('2026-10-16T14:05:00Z'));
      vi.advanceTimersByTime(1000);
    });
    // The fake clock also advanced by the one second the timer ran for.
    expect(result.current).toBe(new Date('2026-10-16T14:05:01Z').getTime());
  });

  it('stops ticking when the component goes away', () => {
    const { unmount } = renderHook(() => useNow('2026-10-16T13:00:00.000Z', 1000));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
