import { describe, expect, it, vi } from 'vitest';
import { createAudioContext, playChime, type AudioContextLike } from './chime';

function fakeContext() {
  const oscillators: {
    frequency: { value: number };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    type: string;
  }[] = [];
  const gains: {
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
  }[] = [];
  const context = {
    currentTime: 10,
    destination: {} as AudioDestinationNode,
    state: 'running' as AudioContextState,
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => {
      const oscillator = {
        frequency: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        type: '',
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
    createGain: vi.fn(() => {
      const gain = {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }),
  };
  return { context: context as unknown as AudioContextLike, oscillators, gains };
}

describe('playChime', () => {
  it('plays two rising notes, one after the other', () => {
    const { context, oscillators } = fakeContext();
    playChime(context);
    expect(oscillators).toHaveLength(2);
    expect(oscillators.map((o) => o.frequency.value)).toEqual([880, 1175]);
    const starts = oscillators.map((o) => o.start.mock.calls[0]?.[0] as number);
    expect(starts[0]).toBe(10);
    expect(starts[1]).toBeCloseTo(10.2);
  });

  it('stops every note so nothing keeps running', () => {
    const { context, oscillators } = fakeContext();
    playChime(context);
    for (const oscillator of oscillators) {
      expect(oscillator.stop).toHaveBeenCalledTimes(1);
      const start = oscillator.start.mock.calls[0]?.[0] as number;
      const stop = oscillator.stop.mock.calls[0]?.[0] as number;
      expect(stop).toBeGreaterThan(start);
    }
  });

  it('fades each note in and out to avoid clicks, and respects the volume', () => {
    const { context, gains } = fakeContext();
    playChime(context, 0.5);
    for (const gain of gains) {
      expect(gain.gain.setValueAtTime).toHaveBeenCalledTimes(1);
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledTimes(2);
      expect(gain.gain.exponentialRampToValueAtTime.mock.calls[0]?.[0]).toBe(0.5);
    }
  });

  it('connects the notes to the speakers', () => {
    const { context, oscillators, gains } = fakeContext();
    playChime(context);
    expect(oscillators.every((o) => o.connect.mock.calls.length === 1)).toBe(true);
    for (const gain of gains) expect(gain.connect).toHaveBeenCalledWith(context.destination);
  });
});

describe('createAudioContext', () => {
  it('creates a context from AudioContext', () => {
    const Fake = vi.fn();
    const result = createAudioContext({ AudioContext: Fake });
    expect(Fake).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Fake);
  });

  it('falls back to the older webkit name', () => {
    const Fake = vi.fn();
    expect(createAudioContext({ webkitAudioContext: Fake })).toBeInstanceOf(Fake);
  });

  it('returns null when the browser has no Web Audio', () => {
    expect(createAudioContext({})).toBeNull();
  });

  it('returns null if the browser refuses to create one', () => {
    const Refuses = vi.fn(() => {
      throw new Error('blocked');
    });
    expect(createAudioContext({ AudioContext: Refuses })).toBeNull();
  });
});
