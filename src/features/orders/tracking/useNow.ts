'use client';

import { useEffect, useState } from 'react';

/**
 * A clock for showing "ready around" vs "almost ready". It starts from the time the server
 * rendered the page, so the first render matches the server's HTML, then ticks forward.
 */
export function useNow(initialIso: string, intervalMs = 30_000): number {
  const [now, setNow] = useState(() => new Date(initialIso).getTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
