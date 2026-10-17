import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { CouponResult } from '@/features/checkout/types/quote.types';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { formatPrice } from '@/shared/utils/format';

interface CouponBoxProps {
  code: string | null;
  /** The server's verdict on the saved code, or null while it is still being checked. */
  result: CouponResult | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}

export function CouponBox({ code, result, onApply, onRemove }: CouponBoxProps) {
  const t = useTranslations('cart');
  const [draft, setDraft] = useState('');

  if (code) {
    return (
      <div className="flex flex-col gap-2">
        {result?.applied ? (
          <p className="text-sm text-green-400">
            {t('couponApplied', { code: result.code })} (−{formatPrice(result.discount)})
          </p>
        ) : result?.reason ? (
          <p role="alert" className="text-sm text-red-400">
            {t(`couponReasons.${result.reason}`)}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          className="focus-visible:outline-ember min-h-11 self-start rounded-lg px-3 text-sm text-stone-400 underline hover:text-white focus-visible:outline-2"
        >
          {t('removeCoupon')} ({code})
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() === '') return;
        onApply(draft);
        setDraft('');
      }}
    >
      <div className="flex-1">
        <Input
          label={t('coupon')}
          value={draft}
          maxLength={40}
          autoComplete="off"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={draft.trim() === ''}>
        {t('applyCoupon')}
      </Button>
    </form>
  );
}
