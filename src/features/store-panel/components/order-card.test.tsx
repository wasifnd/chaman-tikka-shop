// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';
import type { OrderAction } from '../logic/board';
import type { StaffOrder } from '../types/staff-order.types';
import { OrderCard } from './OrderCard';

const T0 = Date.UTC(2026, 9, 16, 14, 0);
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

const order = (overrides: Partial<StaffOrder> = {}): StaffOrder => ({
  id: 'o1',
  orderNumber: 'BBQ-2026-0042',
  status: 'RECEIVED',
  type: 'DELIVERY',
  createdAt: at(0),
  estimatedReadyAt: at(30),
  customerName: 'Ali Khan',
  phone: '03001234567',
  address: { line1: 'House 12, Street 4', line2: 'Near the park', area: 'Johar Town' },
  instructions: 'ring twice',
  items: [
    { name: 'Chicken Tikka', options: ['Half', 'Raita'], quantity: 2, note: 'no onions' },
    { name: 'Naan', options: [], quantity: 4, note: null },
  ],
  subtotal: 1460,
  couponDiscount: 0,
  deliveryCharge: 100,
  taxAmount: 0,
  grandTotal: 1560,
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  cancelReason: null,
  ...overrides,
});

function show(
  o: StaffOrder,
  props: { nowMs?: number; busy?: boolean; onAction?: (a: OrderAction, r?: string) => void } = {},
) {
  const onAction = props.onAction ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ul>
        <OrderCard
          order={o}
          nowMs={props.nowMs ?? T0 + 4 * 60_000}
          busy={props.busy ?? false}
          onAction={onAction}
        />
      </ul>
    </NextIntlClientProvider>,
  );
  return onAction;
}
afterEach(cleanup);

describe('what staff see', () => {
  it('shows everything needed to prepare and hand over the order', () => {
    show(order());
    expect(screen.getByRole('heading', { name: 'BBQ-2026-0042' })).toBeInTheDocument();
    expect(screen.getByText(/Delivery · Placed 4 min/)).toBeInTheDocument();
    expect(screen.getByText('Ali Khan')).toBeInTheDocument();
    expect(screen.getByText(/House 12, Street 4, Near the park, Johar Town/)).toBeInTheDocument();
    expect(screen.getByText(/2 × Chicken Tikka/)).toBeInTheDocument();
    expect(screen.getByText('Half, Raita')).toBeInTheDocument();
    expect(screen.getByText('Note: no onions')).toBeInTheDocument();
    expect(screen.getByText(/ring twice/)).toBeInTheDocument();
  });

  it('makes the phone number a call link', () => {
    show(order());
    expect(screen.getByRole('link', { name: 'Call Ali Khan' })).toHaveAttribute(
      'href',
      'tel:03001234567',
    );
  });

  it('says how much cash to collect, or that it is paid', () => {
    show(order());
    expect(screen.getByText('Collect Rs. 1,560 in cash')).toBeInTheDocument();
    cleanup();
    show(order({ paymentStatus: 'PAID' }));
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.queryByText(/Collect/)).toBeNull();
  });

  it('leaves out the address for pickup and copes with a missing phone', () => {
    show(order({ type: 'PICKUP', address: null, phone: '' }));
    expect(screen.queryByText(/Deliver to/)).toBeNull();
    expect(screen.queryByRole('link', { name: /Call/ })).toBeNull();
  });

  it('shows the promised ready time while the order is active', () => {
    show(order());
    expect(screen.getByText(/Ready by/)).toBeInTheDocument();
  });

  it('shows why an order was cancelled', () => {
    show(order({ status: 'CANCELLED', cancelReason: 'Out of chicken' }));
    expect(screen.getByText('Cancelled: Out of chicken')).toBeInTheDocument();
    cleanup();
    show(order({ status: 'CANCELLED', cancelReason: null }));
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('flags how urgent an order is', () => {
    show(order(), { nowMs: T0 + 1 * 60_000 });
    expect(document.querySelector('li[data-urgency]')).toHaveAttribute('data-urgency', 'ok');
    cleanup();
    show(order(), { nowMs: T0 + 6 * 60_000 });
    expect(document.querySelector('li[data-urgency]')).toHaveAttribute('data-urgency', 'late');
  });
});

describe('buttons', () => {
  const buttons = () => screen.queryAllByRole('button').map((b) => b.textContent);

  it('offers accept or reject for a new order, accepting straight away', () => {
    const onAction = show(order());
    expect(buttons()).toEqual(['Accept', 'Reject']);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ to: 'CONFIRMED' }));
    expect(vi.mocked(onAction).mock.calls[0]?.[1]).toBeUndefined();
  });

  it.each([
    ['CONFIRMED', 'DELIVERY', ['Start preparing', 'Cancel order']],
    ['PREPARING', 'DELIVERY', ['Mark ready', 'Cancel order']],
    ['READY', 'DELIVERY', ['Out for delivery', 'Cancel order']],
    ['READY', 'PICKUP', ['Picked up', 'Cancel order']],
    ['READY', 'DINE_IN', ['Served', 'Cancel order']],
    ['OUT_FOR_DELIVERY', 'DELIVERY', ['Delivered']],
    ['DELIVERED', 'DELIVERY', ['Complete']],
    ['COMPLETED', 'DELIVERY', []],
    ['CANCELLED', 'DELIVERY', []],
  ] as const)('offers the right buttons for a %s %s order', (status, type, expected) => {
    show(order({ status, type }));
    expect(buttons()).toEqual([...expected]);
  });

  it('disables every button while a change is in flight', () => {
    show(order(), { busy: true });
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
});

describe('rejecting or cancelling', () => {
  it('asks for a reason first and does nothing until one is given', () => {
    const onAction = show(order());
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByLabelText('Reason (shown to staff)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByText('Please give a reason.')).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('refuses a blank reason', () => {
    const onAction = show(order());
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText('Reason (shown to staff)'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('sends the cancellation with its trimmed reason', () => {
    const onAction = show(order({ status: 'PREPARING' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    fireEvent.change(screen.getByLabelText('Reason (shown to staff)'), {
      target: { value: '  Out of chicken ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'CANCELLED', needsReason: true }),
      'Out of chicken',
    );
    // The reason box closes and the normal buttons return.
    expect(screen.queryByLabelText('Reason (shown to staff)')).toBeNull();
  });

  it('can be backed out of without changing anything', () => {
    const onAction = show(order());
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText('Reason (shown to staff)'), {
      target: { value: 'typing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep order' }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    // and starts fresh next time
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByLabelText('Reason (shown to staff)')).toHaveValue('');
  });

  it('clears the missing-reason message once the staff member starts typing', () => {
    show(order());
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByText('Please give a reason.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason (shown to staff)'), { target: { value: 'x' } });
    expect(screen.queryByText('Please give a reason.')).toBeNull();
  });
});
