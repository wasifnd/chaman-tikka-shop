'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { postJson } from '@/shared/utils/api';

interface Started {
  id: string;
  code: string;
  mode: 'whatsapp' | 'dev';
  whatsappUrl?: string;
  businessNumber?: string;
}

type Step =
  | { name: 'idle' }
  | { name: 'starting' }
  | { name: 'waiting'; started: Started }
  | { name: 'expired' };

export interface PhoneVerificationProps {
  /** The number to prove, already in its stored form (03XXXXXXXXX). */
  phone: string;
  /** Whether this number is already proven (by this widget, or by the signed-in account). */
  verified: boolean;
  /** Called with the id of the check that proved the number; the form sends it along. */
  onVerified: (verificationId: string) => void;
  /** How often to ask whether the message has arrived. */
  pollMs?: number;
}

function readStarted(data: unknown): Started | null {
  if (typeof data !== 'object' || data === null) return null;
  const value = data as Partial<Started>;
  if (typeof value.id !== 'string' || typeof value.code !== 'string') return null;
  return {
    id: value.id,
    code: value.code,
    mode: value.mode === 'whatsapp' ? 'whatsapp' : 'dev',
    ...(typeof value.whatsappUrl === 'string' ? { whatsappUrl: value.whatsappUrl } : {}),
    ...(typeof value.businessNumber === 'string' ? { businessNumber: value.businessNumber } : {}),
  };
}

async function fetchStatus(id: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/v1/verify/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const payload = (await response.json()) as { data?: { status?: unknown } };
    return typeof payload.data?.status === 'string' ? payload.data.status : null;
  } catch {
    return null; // A dropped connection: just ask again next time.
  }
}

/**
 * Proves a phone number the free way: the customer sends us a code on WhatsApp from that phone,
 * and this widget waits until the message has arrived.
 */
export function PhoneVerification({
  phone,
  verified,
  onVerified,
  pollMs = 2000,
}: PhoneVerificationProps) {
  const t = useTranslations('verify');
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const waitingId = step.name === 'waiting' ? step.started.id : null;

  useEffect(() => {
    if (!waitingId || verified) return;
    let stopped = false;
    const timer = setInterval(() => {
      void fetchStatus(waitingId).then((status) => {
        if (stopped) return;
        if (status === 'verified') onVerified(waitingId);
        else if (status === 'expired') setStep({ name: 'expired' });
      });
    }, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waitingId, verified, onVerified, pollMs]);

  if (verified) {
    return (
      <p role="status" className="text-sm font-medium text-emerald-400">
        {t('verified', { phone })}
      </p>
    );
  }

  async function start() {
    setError(null);
    setStep({ name: 'starting' });
    const result = await postJson('/api/v1/verify', { phone });
    const started = result.ok ? readStarted(result.data) : null;
    if (!started) {
      setError(result.ok ? t('failed') : result.error.message);
      setStep({ name: 'idle' });
      return;
    }
    setStep({ name: 'waiting', started });
  }

  async function pretendSent(id: string) {
    setError(null);
    const result = await postJson(`/api/v1/verify/${encodeURIComponent(id)}/confirm`);
    if (result.ok) onVerified(id);
    else setError(result.error.message);
  }

  return (
    <div className="rounded-lg bg-stone-900/60 p-3 text-sm ring-1 ring-stone-700">
      {error ? <Alert>{error}</Alert> : null}
      {step.name === 'waiting' ? (
        <div className="flex flex-col gap-3">
          <p>{t('sendCode', { phone })}</p>
          <p className="font-mono text-2xl tracking-widest text-white" aria-label={t('codeLabel')}>
            {step.started.code}
          </p>
          {step.started.mode === 'whatsapp' && step.started.whatsappUrl ? (
            <>
              <a
                href={step.started.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-500"
              >
                {t('openWhatsapp')}
              </a>
              <p className="text-stone-400">
                {t('orSend', { number: step.started.businessNumber ?? '' })}
              </p>
            </>
          ) : (
            <>
              <p className="text-amber-300">{t('devNotice')}</p>
              <Button variant="secondary" onClick={() => void pretendSent(step.started.id)}>
                {t('devConfirm')}
              </Button>
            </>
          )}
          <p role="status" className="text-stone-400">
            {t('waiting')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-stone-300">
            {step.name === 'expired' ? t('expired') : t('why', { phone })}
          </p>
          <Button
            variant="secondary"
            loading={step.name === 'starting'}
            onClick={() => void start()}
          >
            {step.name === 'expired' ? t('tryAgain') : t('start')}
          </Button>
        </div>
      )}
    </div>
  );
}
