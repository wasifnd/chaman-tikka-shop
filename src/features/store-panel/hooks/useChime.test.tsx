// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUND_STORAGE_KEY, useChime } from './useChime';

let contexts: FakeAudioContext[] = [];
let startState: AudioContextState = 'suspended';
let resumeBecomes: AudioContextState = 'running';
let oscillatorsStarted = 0;

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  state: AudioContextState = startState;
  constructor() {
    contexts.push(this);
  }
  resume() {
    this.state = resumeBecomes;
    return Promise.resolve();
  }
  createOscillator() {
    return {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: () => {
        oscillatorsStarted += 1;
      },
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
}

beforeEach(() => {
  contexts = [];
  oscillatorsStarted = 0;
  startState = 'suspended';
  resumeBecomes = 'running';
  window.localStorage.clear();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'AudioContext');
});

describe('turning sound on', () => {
  it('starts off', () => {
    const { result } = renderHook(() => useChime());
    expect(result.current).toMatchObject({ enabled: false, blocked: false, unsupported: false });
  });

  it('plays a sample chime, remembers the choice, and plays on later new orders', async () => {
    const { result } = renderHook(() => useChime());
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.enabled).toBe(true);
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe('1');
    expect(oscillatorsStarted).toBe(2); // the sample

    act(() => {
      result.current.play();
    });
    expect(oscillatorsStarted).toBe(4);
  });

  it('makes no sound when it is off', () => {
    const { result } = renderHook(() => useChime());
    act(() => {
      result.current.play();
    });
    expect(oscillatorsStarted).toBe(0);
    expect(result.current.blocked).toBe(false);
  });

  it('can be turned off again', async () => {
    const { result } = renderHook(() => useChime());
    await act(async () => {
      await result.current.enable();
    });
    act(() => {
      result.current.disable();
    });
    expect(result.current.enabled).toBe(false);
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe('0');
    const before = oscillatorsStarted;
    act(() => {
      result.current.play();
    });
    expect(oscillatorsStarted).toBe(before);
  });
});

describe('remembering the choice', () => {
  it('is on when it was left on last time', () => {
    window.localStorage.setItem(SOUND_STORAGE_KEY, '1');
    const { result } = renderHook(() => useChime());
    expect(result.current.enabled).toBe(true);
  });

  it('says it needs a tap when it is on but the browser has not allowed sound yet', () => {
    window.localStorage.setItem(SOUND_STORAGE_KEY, '1');
    const { result } = renderHook(() => useChime());
    act(() => {
      result.current.play(); // a new order arrives before anyone has touched the page
    });
    expect(result.current.blocked).toBe(true);
    expect(oscillatorsStarted).toBe(0);
  });

  it('starts working again at the first tap', async () => {
    window.localStorage.setItem(SOUND_STORAGE_KEY, '1');
    const { result } = renderHook(() => useChime());
    act(() => {
      result.current.play();
    });
    expect(result.current.blocked).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
      await Promise.resolve();
    });
    expect(result.current.blocked).toBe(false);
    act(() => {
      result.current.play();
    });
    expect(oscillatorsStarted).toBe(2);
  });

  it('reacts when another tab changes the setting', () => {
    const { result } = renderHook(() => useChime());
    act(() => {
      window.localStorage.setItem(SOUND_STORAGE_KEY, '1');
      window.dispatchEvent(new StorageEvent('storage', { key: SOUND_STORAGE_KEY }));
    });
    expect(result.current.enabled).toBe(true);
  });
});

describe('when sound cannot work', () => {
  it('reports a browser without sound support and does not turn on', async () => {
    Reflect.deleteProperty(window, 'AudioContext');
    const { result } = renderHook(() => useChime());
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.unsupported).toBe(true);
    expect(result.current.enabled).toBe(false);
  });

  it('reports blocked when the browser still refuses after the button press', async () => {
    resumeBecomes = 'suspended';
    const { result } = renderHook(() => useChime());
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.enabled).toBe(true);
    expect(result.current.blocked).toBe(true);
    expect(oscillatorsStarted).toBe(0);
  });

  it('keeps working if the browser throws while resuming', async () => {
    class Throwing extends FakeAudioContext {
      override resume(): Promise<void> {
        return Promise.reject(new Error('NotAllowedError'));
      }
    }
    Object.defineProperty(window, 'AudioContext', { value: Throwing, configurable: true });
    const { result } = renderHook(() => useChime());
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.blocked).toBe(true);
  });

  it('survives blocked storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => useChime());
    expect(result.current.enabled).toBe(false);
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.unsupported).toBe(false);
    vi.restoreAllMocks();
  });
});
