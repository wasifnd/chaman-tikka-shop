'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import type { StatusChangeError } from '../hooks/useStoreOrders';

const KNOWN_ERRORS = ['INVALID_TRANSITION', 'REASON_REQUIRED', 'ORDER_NOT_FOUND'] as const;

/** Why a status change failed, in words staff can act on. */
export function MoveErrorBanner({
  error,
  onDismiss,
}: {
  error: StatusChangeError;
  onDismiss: () => void;
}) {
  const t = useTranslations('store');
  const known = KNOWN_ERRORS.find((code) => code === error.error.code);
  return (
    <div className="flex items-center justify-between gap-3">
      <Alert>{known ? t(`errors.${known}`) : t('errors.generic')}</Alert>
      <Button variant="ghost" onClick={onDismiss}>
        {t('dismiss')}
      </Button>
    </div>
  );
}

export function NewOrderBanner({ number, onDismiss }: { number: string; onDismiss: () => void }) {
  const t = useTranslations('store');
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-lg bg-green-950 px-4 py-3 text-green-200"
    >
      <span className="font-semibold">{t('newOrderBanner', { number })}</span>
      <Button variant="ghost" onClick={onDismiss}>
        {t('dismiss')}
      </Button>
    </div>
  );
}

export function SignedOutNotice() {
  const t = useTranslations('store');
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <Alert>{t('signedOut')}</Alert>
      <Link
        href="/auth/login?next=/store/orders"
        className="bg-ember inline-flex min-h-11 items-center rounded-lg px-4 font-semibold text-white hover:bg-orange-600"
      >
        {t('signIn')}
      </Link>
    </div>
  );
}

export function LoadFailedNotice({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('store');
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <Alert>{t('loadFailed')}</Alert>
      <Button variant="secondary" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}
