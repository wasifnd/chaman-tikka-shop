'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/utils/cn';
import type { Chime } from '../hooks/useChime';
import type { StreamStatus } from '../hooks/useStoreStream';

const DOT: Record<StreamStatus, string> = {
  live: 'bg-green-500',
  connecting: 'bg-stone-500',
  reconnecting: 'bg-amber-500',
  offline: 'bg-red-500',
  signedOut: 'bg-red-500',
};

/** Connection state and the sound switch, shown at the top of every store screen. */
export function StoreStatusBar({ connection, chime }: { connection: StreamStatus; chime: Chime }) {
  const t = useTranslations('store');
  const label = connection === 'signedOut' ? 'offline' : connection;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <p role="status" className="flex items-center gap-2">
        <span aria-hidden="true" className={cn('size-2.5 rounded-full', DOT[connection])} />
        {t(`connection.${label}`)}
      </p>

      {chime.unsupported ? (
        <p className="text-stone-400">{t('sound.unsupported')}</p>
      ) : (
        <button
          type="button"
          aria-pressed={chime.enabled}
          onClick={() => {
            if (chime.enabled) chime.disable();
            else void chime.enable();
          }}
          className="focus-visible:outline-ember bg-ash min-h-11 rounded-lg px-3 ring-1 ring-stone-700 hover:bg-stone-800 focus-visible:outline-2"
        >
          {chime.enabled ? t('sound.off') : t('sound.enable')}
        </button>
      )}
      {chime.enabled && !chime.unsupported ? (
        <span className="text-stone-400">{chime.blocked ? t('sound.blocked') : t('sound.on')}</span>
      ) : null}
    </div>
  );
}
