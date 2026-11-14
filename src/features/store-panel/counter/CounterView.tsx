'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  addItem,
  emptyCart,
  removeItem,
  setQuantity,
  toQuoteRequest,
  type CartState,
} from '@/features/cart/store/cart.logic';
import { useQuote } from '@/features/cart/hooks/useQuote';
import { staffApi } from '@/features/khata/client';
import type { KhataSummary } from '@/features/khata/types/khata.types';
import type { CounterMenu, ProductDetail } from '@/features/menu/types/menu.types';
import type { PlacedCounterOrder } from '@/features/orders/types/order.types';
import { normalizePhone } from '@/lib/validation/phone';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { QuantityStepper } from '@/shared/components/ui/QuantityStepper';
import { Textarea } from '@/shared/components/ui/Textarea';
import { formatPrice } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import {
  dealLine,
  matches,
  needsChoices,
  paymentSplit,
  productLine,
  defaultSelection,
  roomLeft,
  type PaymentMode,
} from './counter-logic';
import { ItemPicker } from './ItemPicker';

/** At the till the cashier decides whether the shop is open; these warnings don't apply. */
const IGNORED_ISSUES = new Set(['RESTAURANT_CLOSED', 'ORDERING_DISABLED']);

/** Errors after which the order may or may not exist. */
const UNKNOWN_OUTCOME = new Set(['ORDER_IN_PROGRESS', 'NETWORK_ERROR', 'INTERNAL_ERROR']);

type Placed = PlacedCounterOrder;

interface Lookup {
  khata: KhataSummary | null;
  defaultLimit: number;
}

async function lookupKhata(phone: string): Promise<Lookup> {
  const result = await staffApi(`/api/v1/store/khata/lookup?phone=${encodeURIComponent(phone)}`);
  if (!result.ok) throw new Error(result.error.message);
  return result.data as Lookup;
}

const startCart = (): CartState => ({ ...emptyCart, orderType: 'PICKUP' });

/** The cashier's screen: build the order, take the money, and put any balance on a khata. */
export function CounterView({ menu }: { menu: CounterMenu }) {
  const t = useTranslations('counter');
  const [cart, setCart] = useState<CartState>(startCart);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<ProductDetail | null>(null);
  const [mode, setMode] = useState<PaymentMode>('FULL');
  const [typedPaid, setTypedPaid] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);

  const request = useMemo(() => toQuoteRequest(cart), [cart]);
  const quote = useQuote(request, cart.items.length > 0);
  const total = cart.items.length > 0 ? (quote.data?.grandTotal ?? null) : 0;
  const issues = (quote.data?.issues ?? []).filter((issue) => !IGNORED_ISSUES.has(issue.code));
  const split = paymentSplit(total ?? 0, mode, typedPaid);
  const onKhata = mode !== 'FULL';
  const khataPhone = onKhata ? normalizePhone(phone) : null;

  const lookup = useQuery({
    queryKey: ['khata-lookup', khataPhone],
    queryFn: () => lookupKhata(khataPhone ?? ''),
    enabled: khataPhone !== null,
    staleTime: 10_000,
  });
  const existing = lookup.data?.khata ?? null;
  const limit = existing?.limit ?? lookup.data?.defaultLimit ?? null;
  const balance = existing?.balance ?? 0;
  const overLimit = limit !== null && split.remaining > roomLeft(balance, limit);

  const products = menu.categories
    .filter((c) => category === 'all' || c.id === category)
    .flatMap((c) => c.products)
    .filter((p) => matches(p.name, search));
  const deals = category === 'all' || category === 'deals' ? menu.deals : [];
  const shownDeals = deals.filter((d) => matches(d.name, search));

  function tap(product: ProductDetail) {
    if (!product.orderable) return;
    if (needsChoices(product)) setPicking(product);
    else setCart((c) => addItem(c, productLine(product, defaultSelection(product), 1)));
  }

  function reset() {
    setCart(startCart());
    setMode('FULL');
    setTypedPaid('');
    setPhone('');
    setName('');
    setNotes('');
    setError(null);
    setFieldErrors({});
    setPlaced(null);
    setKey(crypto.randomUUID());
  }

  async function place() {
    if (total === null) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    const result = await staffApi('/api/v1/store/counter-orders', {
      method: 'POST',
      body: {
        idempotencyKey: key,
        lines: request.lines,
        orderType: cart.orderType,
        expectedTotal: total,
        amountPaid: split.paid,
        // Only an order left on a khata takes the number and name; a leftover half-typed
        // number in the hidden field must not block a paid order.
        customer: onKhata ? { name: name.trim(), phone: phone.trim() } : {},
        instructions: notes,
      },
    });
    setSubmitting(false);
    if (result.ok) {
      setPlaced((result.data as { order: Placed }).order);
      return;
    }
    // The same key with a different ticket: an earlier press may have placed the order.
    setError(
      result.error.code === 'IDEMPOTENCY_CONFLICT' ? t('maybePlaced') : result.error.message,
    );
    setFieldErrors(result.error.details ?? {});
    if (result.error.code === 'PRICE_CHANGED') void quote.refetch();
    // A clear refusal means the next try is a new order. When the outcome is unknown (no answer,
    // or the order is still being placed) keep the key, so pressing again can't make it twice.
    if (!UNKNOWN_OUTCOME.has(result.error.code)) setKey(crypto.randomUUID());
  }

  if (placed) {
    return (
      <section aria-labelledby="placed-title" className="bg-ash mx-auto max-w-xl rounded-xl p-6">
        <h2 id="placed-title" className="font-display text-gold mb-2 text-3xl">
          {t('placedTitle', { number: placed.orderNumber })}
        </h2>
        <dl className="mb-4 grid grid-cols-2 gap-y-1 text-lg">
          <dt>{t('total')}</dt>
          <dd className="text-right">{formatPrice(placed.grandTotal)}</dd>
          <dt>{t('paidNow')}</dt>
          <dd className="text-right">{formatPrice(placed.amountPaid)}</dd>
          {placed.remaining > 0 ? (
            <>
              <dt className="text-gold">{t('toKhata')}</dt>
              <dd className="text-gold text-right">{formatPrice(placed.remaining)}</dd>
              <dt>{t('khataNow')}</dt>
              <dd className="text-right">{formatPrice(placed.khata?.balance ?? 0)}</dd>
            </>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/api/v1/store/orders/${placed.id}/receipt`}
            target="_blank"
            rel="noopener"
            className="bg-ember hover:bg-ember-deep focus-visible:outline-gold inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white focus-visible:outline-2"
          >
            {t('printReceipt')}
          </a>
          {placed.khata ? (
            <Link
              href={`/store/khata/${placed.khata.id}`}
              className="text-gold inline-flex min-h-11 items-center underline"
            >
              {t('openKhata')}
            </Link>
          ) : null}
          <Button variant="secondary" onClick={reset} autoFocus>
            {t('newOrder')}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      {/* ---- The menu ---- */}
      <section aria-labelledby="menu-title" className="flex flex-col gap-4">
        <h2 id="menu-title" className="sr-only">
          {t('menu')}
        </h2>
        <Input
          label={t('search')}
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        <div role="group" aria-label={t('categories')} className="flex flex-wrap gap-2">
          {[
            { id: 'all', name: t('all') },
            ...(menu.deals.length > 0 ? [{ id: 'deals', name: t('deals') }] : []),
            ...menu.categories.map((c) => ({ id: c.id, name: c.name })),
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => {
                setCategory(c.id);
              }}
              className={cn(
                'focus-visible:outline-gold min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2',
                category === c.id ? 'bg-ember text-white' : 'bg-ash ring-1 ring-stone-700',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {picking ? (
          <ItemPicker
            key={picking.id}
            product={picking}
            onCancel={() => {
              setPicking(null);
            }}
            onAdd={(line) => {
              setCart((c) => addItem(c, line));
              setPicking(null);
            }}
          />
        ) : null}

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {category !== 'deals'
            ? products.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={!product.orderable}
                    onClick={() => {
                      tap(product);
                    }}
                    className="bg-ash focus-visible:outline-gold hover:ring-gold/60 flex min-h-20 w-full flex-col items-start justify-between rounded-lg p-3 text-left ring-1 ring-stone-700 focus-visible:outline-2 disabled:opacity-40"
                  >
                    <span className="font-medium">{product.name}</span>
                    <span className="text-gold text-sm">
                      {product.orderable ? formatPrice(product.price) : t('unavailable')}
                    </span>
                  </button>
                </li>
              ))
            : null}
          {shownDeals.map((deal) => (
            <li key={deal.id}>
              <button
                type="button"
                onClick={() => {
                  setCart((c) => addItem(c, dealLine(deal)));
                }}
                className="bg-ash focus-visible:outline-gold ring-gold/40 hover:ring-gold flex min-h-20 w-full flex-col items-start justify-between rounded-lg p-3 text-left ring-1 focus-visible:outline-2"
              >
                <span className="font-medium">{deal.name}</span>
                <span className="text-gold text-sm">
                  {t('deal')} · {formatPrice(deal.price)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- The ticket and payment ---- */}
      <section
        aria-labelledby="ticket-title"
        className="bg-ash flex flex-col gap-4 self-start rounded-xl p-4 lg:sticky lg:top-4"
      >
        <h2 id="ticket-title" className="text-xl font-semibold">
          {t('ticket')}
        </h2>

        <div role="group" aria-label={t('orderType')} className="grid grid-cols-2 gap-2">
          {(['PICKUP', 'DINE_IN'] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={cart.orderType === type}
              onClick={() => {
                setCart((c) => ({ ...c, orderType: type }));
              }}
              className={cn(
                'focus-visible:outline-gold min-h-11 rounded-lg text-sm font-semibold focus-visible:outline-2',
                cart.orderType === type ? 'bg-ember text-white' : 'ring-1 ring-stone-700',
              )}
            >
              {t(`type.${type}`)}
            </button>
          ))}
        </div>

        {cart.items.length === 0 ? (
          <p className="text-stone-400">{t('emptyTicket')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-stone-800">
            {cart.items.map((item) => (
              <li key={item.key} className="flex flex-col gap-2 py-2">
                <div className="flex justify-between gap-2">
                  <span>
                    {item.name}
                    {item.kind === 'product' && item.optionLabels.length > 0 ? (
                      <span className="block text-xs text-stone-400">
                        {item.optionLabels.join(', ')}
                      </span>
                    ) : null}
                  </span>
                  <span>{formatPrice(item.unitPrice * item.quantity)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <QuantityStepper
                    value={item.quantity}
                    onChange={(next) => {
                      setCart((c) => setQuantity(c, item.key, next));
                    }}
                    label={t('quantityOf', { name: item.name })}
                    decreaseLabel={t('fewer')}
                    increaseLabel={t('more')}
                  />
                  <Button
                    variant="ghost"
                    aria-label={t('removeItem', { name: item.name })}
                    onClick={() => {
                      setCart((c) => removeItem(c, item.key));
                    }}
                  >
                    {t('remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {issues.length > 0 ? (
          <Alert>
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.code}-${String(issue.lineIndex ?? '')}`}>{issue.message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <p className="flex justify-between text-2xl font-bold" aria-live="polite">
          <span>{t('total')}</span>
          <span>{total === null ? '…' : formatPrice(total)}</span>
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{t('payment')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['FULL', 'PART', 'NONE'] as const).map((value) => (
              <label
                key={value}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-semibold ring-1',
                  mode === value ? 'bg-ember ring-ember text-white' : 'ring-stone-700',
                )}
              >
                <input
                  type="radio"
                  name="payment"
                  className="sr-only"
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                  }}
                />
                {t(`mode.${value}`)}
              </label>
            ))}
          </div>
          {mode === 'PART' ? (
            <Input
              label={t('amountPaid')}
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={typedPaid}
              error={fieldErrors['amountPaid']}
              onChange={(event) => {
                setTypedPaid(event.target.value);
              }}
            />
          ) : null}
        </fieldset>

        {onKhata ? (
          <fieldset className="ring-gold/40 flex flex-col gap-3 rounded-lg p-3 ring-1">
            <legend className="text-gold px-1 font-semibold">{t('khata')}</legend>
            <Input
              label={t('phone')}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              error={fieldErrors['customer.phone']}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
            />
            {existing ? (
              <p className="rounded-lg bg-stone-900 p-2 text-sm" role="status">
                {t('existingKhata', {
                  name: existing.name,
                  balance: formatPrice(existing.balance),
                  limit: formatPrice(existing.limit),
                })}{' '}
                {name.trim() === existing.name ? null : (
                  <button
                    type="button"
                    className="text-gold underline"
                    onClick={() => {
                      setName(existing.name);
                    }}
                  >
                    {t('useName')}
                  </button>
                )}
              </p>
            ) : khataPhone && lookup.data ? (
              <p className="rounded-lg bg-stone-900 p-2 text-sm" role="status">
                {t('newKhata', { limit: formatPrice(lookup.data.defaultLimit) })}
              </p>
            ) : null}
            <Input
              label={t('name')}
              hint={t('nameHint')}
              autoComplete="off"
              value={name}
              placeholder={existing?.name}
              error={fieldErrors['customer.name']}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt>{t('paidNow')}</dt>
              <dd className="text-right">{formatPrice(split.paid)}</dd>
              <dt className="text-gold font-semibold">{t('toKhata')}</dt>
              <dd className="text-gold text-right font-semibold">{formatPrice(split.remaining)}</dd>
              {khataPhone && limit !== null ? (
                <>
                  <dt>{t('khataAfter')}</dt>
                  <dd className="text-right">{formatPrice(balance + split.remaining)}</dd>
                </>
              ) : null}
            </dl>
            {overLimit ? (
              <Alert>
                {t('overLimit', {
                  limit: formatPrice(limit),
                  room: formatPrice(roomLeft(balance, limit)),
                })}
              </Alert>
            ) : null}
          </fieldset>
        ) : null}

        <Textarea
          label={t('notes')}
          rows={2}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />

        {error ? <Alert>{error}</Alert> : null}

        <Button
          loading={submitting}
          disabled={
            submitting ||
            cart.items.length === 0 ||
            total === null ||
            quote.isFetching ||
            issues.length > 0 ||
            !split.valid ||
            (onKhata && (!khataPhone || name.trim().length < 2 || overLimit))
          }
          onClick={() => {
            void place();
          }}
          className="min-h-14 text-lg"
        >
          {onKhata
            ? t('placeOnKhata', { amount: formatPrice(split.remaining) })
            : t('placePaid', { amount: formatPrice(split.paid) })}
        </Button>
      </section>
    </div>
  );
}
