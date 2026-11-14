'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { formatPrice } from '@/shared/utils/format';
import { staffApi } from '../client';
import type { AdjustmentKind } from '../logic/khata-rules';

interface KhataActionsProps {
  khataId: string;
  balance: number;
  /** The customer's own limit, or null for the shop's default. */
  creditLimit: number | null;
  defaultLimit: number;
  /** Corrections and limits are admin only. */
  isAdmin: boolean;
}

type Errors = Record<string, string>;

/** Errors after which the change may or may not have been saved. */
const UNKNOWN_OUTCOME = new Set(['NETWORK_ERROR', 'INTERNAL_ERROR']);

/**
 * Sends a form, with a request key: pressing Save again after a lost reply sends the same key, so
 * the money is counted once. A new key is used once the outcome is known.
 */
function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Errors>({});
  const [done, setDone] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());

  async function run(url: string, method: 'POST' | 'PATCH', body: unknown, success: string) {
    setBusy(true);
    setError(null);
    setFields({});
    setDone(null);
    const result = await staffApi(url, {
      method,
      body: method === 'POST' ? { ...(body as object), requestKey } : body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      setFields(result.error.details ?? {});
      if (!UNKNOWN_OUTCOME.has(result.error.code)) setRequestKey(crypto.randomUUID());
      if (result.error.code === 'BALANCE_CHANGED') router.refresh();
      return false;
    }
    setRequestKey(crypto.randomUUID());
    setDone(success);
    router.refresh();
    return true;
  }
  return { busy, error, fields, done, run };
}

const numberOrUndefined = (value: string) => (value.trim() === '' ? undefined : Number(value));

/** Take a payment (staff and admin). */
function PaymentForm({ khataId, balance }: { khataId: string; balance: number }) {
  const t = useTranslations('khata');
  const { busy, error, fields, done, run } = useSubmit();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    const ok = await run(
      `/api/v1/store/khata/${khataId}/payments`,
      'POST',
      { amount: numberOrUndefined(amount), note },
      t('paymentSaved'),
    );
    if (ok) {
      setAmount('');
      setNote('');
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
      <h3 className="text-lg font-semibold">{t('takePayment')}</h3>
      <Input
        label={t('amountReceived')}
        type="number"
        inputMode="decimal"
        min="1"
        step="1"
        value={amount}
        error={fields['amount']}
        hint={t('owesNow', { amount: formatPrice(balance) })}
        onChange={(e) => {
          setAmount(e.target.value);
        }}
      />
      <Input
        label={t('noteOptional')}
        hint={t('customerSees')}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
      />
      {error ? <Alert>{error}</Alert> : null}
      {done ? (
        <p role="status" className="text-sm text-green-400">
          {done}
        </p>
      ) : null}
      <Button type="submit" loading={busy} disabled={busy || balance <= 0}>
        {t('savePayment')}
      </Button>
    </form>
  );
}

/** Admin corrections: a charge, a reduction or a write-off, always with a reason. */
function AdjustmentForm({ khataId, balance }: { khataId: string; balance: number }) {
  const t = useTranslations('khata');
  const { busy, error, fields, done, run } = useSubmit();
  const [kind, setKind] = useState<AdjustmentKind>('CHARGE');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    const ok = await run(
      `/api/v1/admin/khata/${khataId}/adjustments`,
      'POST',
      kind === 'WRITE_OFF'
        ? // The balance on screen: if it changed meanwhile, the write-off is refused, not bigger.
          { kind, reason, expectedBalance: balance }
        : { kind, amount: numberOrUndefined(amount), reason },
      t('correctionSaved'),
    );
    if (ok) {
      setAmount('');
      setReason('');
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
      <h3 className="text-lg font-semibold">{t('correct')}</h3>
      <Select
        label={t('correctionType')}
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as AdjustmentKind);
        }}
      >
        <option value="CHARGE">{t('kind.CHARGE')}</option>
        <option value="REDUCTION">{t('kind.REDUCTION')}</option>
        <option value="WRITE_OFF">{t('kind.WRITE_OFF')}</option>
      </Select>
      {kind === 'WRITE_OFF' ? (
        <p className="text-sm text-stone-300">
          {t('writeOffWhat', { amount: formatPrice(balance) })}
        </p>
      ) : (
        <Input
          label={t('amount')}
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={amount}
          error={fields['amount']}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
        />
      )}
      <Input
        label={t('reason')}
        hint={t('customerSees')}
        value={reason}
        error={fields['reason']}
        onChange={(e) => {
          setReason(e.target.value);
        }}
      />
      {error ? <Alert>{error}</Alert> : null}
      {done ? (
        <p role="status" className="text-sm text-green-400">
          {done}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" loading={busy} disabled={busy}>
        {t('saveCorrection')}
      </Button>
    </form>
  );
}

/** Admin gives this customer their own limit, or puts them back on the shop's default. */
function LimitForm({
  khataId,
  creditLimit,
  defaultLimit,
}: {
  khataId: string;
  creditLimit: number | null;
  defaultLimit: number;
}) {
  const t = useTranslations('khata');
  const { busy, error, fields, done, run } = useSubmit();
  const [limit, setLimit] = useState(creditLimit === null ? '' : String(creditLimit));

  async function save(value: number | null) {
    await run(`/api/v1/admin/khata/${khataId}`, 'PATCH', { creditLimit: value }, t('limitSaved'));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(numberOrUndefined(limit) ?? null);
      }}
      className="flex flex-col gap-3"
      noValidate
    >
      <h3 className="text-lg font-semibold">{t('ownLimitTitle')}</h3>
      <Input
        label={t('limitAmount')}
        hint={t('limitHint', { amount: formatPrice(defaultLimit) })}
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={limit}
        error={fields['creditLimit']}
        onChange={(e) => {
          setLimit(e.target.value);
        }}
      />
      {error ? <Alert>{error}</Alert> : null}
      {done ? (
        <p role="status" className="text-sm text-green-400">
          {done}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" loading={busy} disabled={busy}>
          {t('saveLimit')}
        </Button>
        {creditLimit === null ? null : (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setLimit('');
              void save(null);
            }}
          >
            {t('useDefault')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** What staff (and admin) can do to a khata. */
export function KhataActions({
  khataId,
  balance,
  creditLimit,
  defaultLimit,
  isAdmin,
}: KhataActionsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <div className="bg-ash rounded-xl p-4">
        <PaymentForm khataId={khataId} balance={balance} />
      </div>
      {isAdmin ? (
        <>
          <div className="bg-ash rounded-xl p-4">
            <AdjustmentForm khataId={khataId} balance={balance} />
          </div>
          <div className="bg-ash rounded-xl p-4">
            <LimitForm khataId={khataId} creditLimit={creditLimit} defaultLimit={defaultLimit} />
          </div>
        </>
      ) : null}
    </div>
  );
}
