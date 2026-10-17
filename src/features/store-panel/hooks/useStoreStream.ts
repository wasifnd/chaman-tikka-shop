'use client';

import { useEffect, useRef, useState } from 'react';
import { refreshSession } from '@/shared/utils/authed-fetch';
import type { StaffEventPayload } from '../types/staff-order.types';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'signedOut';

/** EventSource.CLOSED: the browser has given up on this connection and will not retry by itself. */
const CLOSED = 2;
const GIVE_UP_AFTER_ERRORS = 3;
const BASE_RETRY_MS = 3000;
const MAX_RETRY_MS = 30_000;

interface Options {
  /** Position to start from; the stream stays off until the first load tells us where "now" is. */
  afterId: number | null;
  onEvent: (id: number, payload: StaffEventPayload) => void;
}

/**
 * Live feed of every order change. The server ends each connection after ~25 seconds and the
 * browser reconnects on its own, which is normal. A different failure matters more: if the login
 * has expired the server answers 401 and the browser stops for good. A kitchen screen can be open
 * all night, so in that case we renew the login and reconnect from where we left off.
 */
export function useStoreStream({ afterId, onEvent }: Options): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const handler = useRef(onEvent);
  const position = useRef<number | null>(null);
  const enabled = afterId !== null;

  useEffect(() => {
    handler.current = onEvent;
  });

  // Remember where the first load said "now" was; after that we track the newest event we saw.
  useEffect(() => {
    if (position.current === null && afterId !== null) position.current = afterId;
  }, [afterId]);

  useEffect(() => {
    if (!enabled) return;

    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let errors = 0;
    let closedRetries = 0;

    const connect = () => {
      if (stopped) return;
      const current = new EventSource(
        `/api/v1/store/events?after=${String(position.current ?? 0)}`,
      );
      source = current;

      current.onopen = () => {
        errors = 0;
        closedRetries = 0;
        setStatus('live');
      };

      const onMessage = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as StaffEventPayload;
          const id = Number(event.lastEventId);
          position.current = Math.max(position.current ?? 0, id);
          handler.current(id, payload);
        } catch {
          // A malformed message is skipped rather than breaking the screen.
        }
      };
      current.addEventListener('order.created', onMessage);
      current.addEventListener('order.status_changed', onMessage);

      current.onerror = () => {
        errors += 1;

        if (current.readyState === CLOSED) {
          // The server refused us (most likely the login expired). The browser won't retry.
          current.close();
          void refreshSession().then((renewed) => {
            if (stopped) return;
            if (!renewed) {
              setStatus('signedOut');
              return;
            }
            setStatus('reconnecting');
            const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** closedRetries);
            closedRetries += 1;
            timer = setTimeout(connect, delay);
          });
          return;
        }

        // One drop per cycle is just the server renewing the stream: say nothing.
        if (errors <= 1) return;
        setStatus(errors >= GIVE_UP_AFTER_ERRORS ? 'offline' : 'reconnecting');
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [enabled]);

  return status;
}
