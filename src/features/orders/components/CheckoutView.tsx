'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CartSummary } from '@/features/cart/components/CartSummary';
import { shouldShowDelivery } from '@/features/cart/components/delivery-visibility';
import { useQuote } from '@/features/cart/hooks/useQuote';
import { toQuoteRequest } from '@/features/cart/store/cart.logic';
import { useCartHydrated } from '@/features/cart/store/useCartHydrated';
import { useCartStore } from '@/features/cart/store/useCartStore';
import type { ZoneOption } from '@/features/checkout/types/zone.types';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { Textarea } from '@/shared/components/ui/Textarea';
import { postJson } from '@/shared/utils/api';
import { formatPrice } from '@/shared/utils/format';
import {
  checkoutFormSchema,
  type CheckoutFormOutput,
  type CheckoutFormValues,
} from '../schemas/checkout-form.schema';
import { classifyFailure, type CheckoutFailure } from './checkout-errors';
import { keyFor, readTrackingToken, type KeyMemory } from './idempotency-key';

export function CheckoutView({ zones }: { zones: ZoneOption[] }) {
  const t = useTranslations('checkout');
  const router = useRouter();
  const queryClient = useQueryClient();
  const hydrated = useCartHydrated();

  const items = useCartStore((state) => state.items);
  const orderType = useCartStore((state) => state.orderType);
  const zoneId = useCartStore((state) => state.zoneId);
  const couponCode = useCartStore((state) => state.couponCode);

  const request = useMemo(
    () => toQuoteRequest({ items, orderType, zoneId, couponCode }),
    [items, orderType, zoneId, couponCode],
  );
  const quote = useQuote(request, hydrated && items.length > 0);
  // Only trust a price that was computed for exactly this cart.
  const current = quote.data !== undefined && !quote.isPlaceholderData ? quote.data : undefined;

  const schema = useMemo(() => checkoutFormSchema(orderType), [orderType]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormValues, unknown, CheckoutFormOutput>({ resolver: zodResolver(schema) });

  const [failure, setFailure] = useState<CheckoutFailure | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const keyMemory = useRef<KeyMemory | null>(null);

  async function onSubmit(values: CheckoutFormOutput) {
    if (!current) return;
    setFailure(null);

    const body = {
      ...request,
      expectedTotal: current.grandTotal,
      contact: { name: values.name, phone: values.phone, email: values.email },
      ...(orderType === 'DELIVERY' && values.addressLine1
        ? { address: { line1: values.addressLine1, line2: values.addressLine2 } }
        : {}),
      instructions: values.instructions,
    };
    // The same order sent twice reuses its key (so it is only placed once); a changed order gets a new one.
    keyMemory.current = keyFor(keyMemory.current, JSON.stringify(body), () => crypto.randomUUID());

    const result = await postJson('/api/v1/orders', {
      ...body,
      idempotencyKey: keyMemory.current.key,
    });

    if (!result.ok) {
      const next = classifyFailure(result.error);
      if (next.kind === 'fields') {
        for (const { field, message } of next.fields) setError(field, { message });
      }
      // The price or cart changed under the customer: show them the fresh numbers.
      if (next.kind === 'cart' || next.kind === 'price' || next.kind === 'coupon') {
        void queryClient.invalidateQueries({ queryKey: ['quote'] });
      }
      setFailure(next);
      return;
    }

    const token = readTrackingToken(result.data);
    setRedirecting(true);
    useCartStore.getState().clear();
    router.push(`/track/${token}?placed=1`);
  }

  if (!hydrated || redirecting) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-8">
        <p className="text-lg font-semibold">{t('emptyCart')}</p>
        <Link href="/menu" className="text-ember underline">
          {t('browseMenu')}
        </Link>
      </div>
    );
  }

  const zoneName = zones.find((zone) => zone.id === zoneId)?.name;
  const canPlace = current?.canCheckout === true && !isSubmitting;

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="grid gap-8 lg:grid-cols-[1fr_22rem]"
    >
      <div className="flex flex-col gap-8">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-lg font-semibold">{t('details')}</legend>
          <Input
            label={t('name')}
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />
          <Input
            label={t('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Input
            label={t('email')}
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <p className="-mt-2 text-sm text-stone-400">{t('emailHint')}</p>
        </fieldset>

        {orderType === 'DELIVERY' ? (
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 text-lg font-semibold">{t('address')}</legend>
            {zoneName ? (
              <p className="text-sm text-stone-400">{t('deliveringTo', { area: zoneName })}</p>
            ) : null}
            <Input
              label={t('addressLine1')}
              autoComplete="address-line1"
              error={errors.addressLine1?.message}
              {...register('addressLine1')}
            />
            <Input
              label={t('addressLine2')}
              autoComplete="address-line2"
              error={errors.addressLine2?.message}
              {...register('addressLine2')}
            />
          </fieldset>
        ) : null}

        <Textarea
          label={t('instructions')}
          maxLength={500}
          error={errors.instructions?.message}
          {...register('instructions')}
        />
      </div>

      <aside className="bg-ash/60 flex h-fit flex-col gap-4 rounded-xl p-4 ring-1 ring-stone-800">
        <h2 className="font-semibold">{t('review')}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {items.map((item) => (
            <li key={item.key} className="flex justify-between gap-3">
              <span>
                {item.quantity} × {item.name}
              </span>
            </li>
          ))}
        </ul>

        <CartSummary
          quote={current ?? quote.data}
          updating={quote.isFetching}
          showDelivery={shouldShowDelivery(orderType, zoneId, current)}
        />

        <p className="text-sm text-stone-400">
          {orderType === 'DELIVERY' ? t('payCod') : t('payCounter')}
        </p>

        {current && !current.canCheckout ? (
          <div className="flex flex-col gap-2">
            <Alert>{t('cannotOrder')}</Alert>
            <ul className="list-inside list-disc text-sm text-red-300">
              {current.issues.map((issue) => (
                <li key={`${issue.code}-${String(issue.lineIndex ?? '')}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <FailureMessage failure={failure} />

        <Button type="submit" disabled={!canPlace} loading={isSubmitting}>
          {isSubmitting ? t('placing') : t('placeOrder')}
        </Button>
        <Link href="/cart" className="text-center text-sm text-stone-400 underline">
          {t('backToCart')}
        </Link>
      </aside>
    </form>
  );
}

function FailureMessage({ failure }: { failure: CheckoutFailure | null }) {
  const t = useTranslations('checkout');
  if (!failure || failure.kind === 'fields') return null;

  const message = {
    cart: t('needsAttention'),
    price: t('priceChanged', {
      total: failure.kind === 'price' && failure.total ? formatPrice(Number(failure.total)) : '',
    }),
    coupon: t('couponExhausted'),
    busy: t('tooMany'),
    inProgress: t('inProgress'),
    other: t('failed'),
  }[failure.kind];

  return <Alert>{message}</Alert>;
}
