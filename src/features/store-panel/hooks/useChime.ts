'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createAudioContext, playChime, type AudioContextLike } from '../sound/chime';

export const SOUND_STORAGE_KEY = 'bbq-store-sound';
const CHANGE_EVENT = 'bbq-store-sound-change';

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Storage blocked: the setting just won't survive a reload.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export interface Chime {
  /** Staff chose to hear new orders. Remembered between visits. */
  enabled: boolean;
  /** Sound is on but the browser is holding it back until the page is tapped. */
  blocked: boolean;
  /** This browser can't play sounds at all. */
  unsupported: boolean;
  enable: () => Promise<void>;
  disable: () => void;
  play: () => void;
}

/**
 * The new-order chime. Browsers only allow sound after the user has interacted with the page, so
 * turning it on is a button press; on later visits it starts working again at the first tap.
 */
export function useChime(): Chime {
  // Server and first render say "off"; the saved choice is picked up right after.
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);
  const context = useRef<AudioContextLike | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const unlock = useCallback(async (): Promise<boolean> => {
    context.current ??= createAudioContext();
    const audio = context.current;
    if (!audio) {
      setUnsupported(true);
      return false;
    }
    try {
      await audio.resume();
    } catch {
      // Still blocked; reported below.
    }
    const running = audio.state === 'running';
    setBlocked(!running);
    return running;
  }, []);

  const enable = useCallback(async () => {
    const running = await unlock();
    if (!context.current) return;
    writeEnabled(true);
    if (running) playChime(context.current);
  }, [unlock]);

  const disable = useCallback(() => {
    writeEnabled(false);
    setBlocked(false);
  }, []);

  const play = useCallback(() => {
    if (!readEnabled()) return;
    const audio = context.current;
    if (audio?.state === 'running') {
      playChime(audio);
    } else {
      // Remembered as on, but the browser hasn't allowed sound yet on this visit.
      setBlocked(true);
    }
  }, []);

  // When sound is on from a previous visit, the first tap anywhere lets it start.
  useEffect(() => {
    if (!enabled) return;
    const onFirstTap = () => {
      void unlock();
    };
    window.addEventListener('pointerdown', onFirstTap, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onFirstTap);
    };
  }, [enabled, unlock]);

  return { enabled, blocked: enabled && blocked, unsupported, enable, disable, play };
}
