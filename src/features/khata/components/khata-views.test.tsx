// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';
import type { KhataDetail, KhataPage } from '../types/khata.types';
import { KhataEntries } from './KhataEntries';
import { KhataList } from './KhataList';

// Server components ask the server for their translator; give them the real messages.
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) =>
    Promise.resolve(createTranslator({ locale: 'en', messages, namespace: namespace as 'khata' })),
}));

afterEach(cleanup);

const khata: KhataDetail = {
  id: 'k1',
  phone: '03331234500',
  name: 'Bilal',
  balance: 490,
  creditLimit: 2_500,
  limit: 2_500,
  updatedAt: '2026-11-14T10:54:00.000Z',
  createdAt: '2026-11-14T10:53:00.000Z',
  entries: [
    {
      id: 'e2',
      kind: 'PAYMENT',
      amount: -300,
      balanceAfter: 490,
      note: 'Cash',
      createdAt: '2026-11-14T10:54:00.000Z',
      by: 'Ahmed',
      order: null,
    },
    {
      id: 'e1',
      kind: 'ORDER',
      amount: 790,
      balanceAfter: 790,
      note: 'Order BBQ-2026-0346',
      createdAt: '2026-11-14T10:53:00.000Z',
      by: 'Ahmed',
      order: { id: 'o1', orderNumber: 'BBQ-2026-0346', trackingToken: 't1' },
    },
    {
      id: 'e0',
      kind: 'CHARGE',
      amount: 0,
      balanceAfter: 0,
      note: 'Opening',
      createdAt: '2026-11-14T10:52:00.000Z',
      by: 'Admin',
      order: null,
    },
  ],
};

const page = (items: KhataPage['items'], total = items.length): KhataPage => ({
  items,
  total,
  page: 1,
  pageSize: 30,
  totalOwed: items.reduce((sum, k) => sum + k.balance, 0),
});

describe('the khata list', () => {
  it('shows who owes what, links each khata, and marks own limits', async () => {
    render(
      await KhataList({
        page: page([khata, { ...khata, id: 'k2', name: 'Sana', balance: 100, creditLimit: null }]),
        basePath: '/admin/khata',
        search: '',
        showAll: false,
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Rs. 590 owed across 2 khatas');
    expect(screen.getByRole('link', { name: 'Bilal' })).toHaveAttribute('href', '/admin/khata/k1');
    expect(screen.getByText('Rs. 2,500 (own limit)')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Phone number or name' })).toHaveValue('');
  });

  it('says when nobody owes, or nothing matches the search', async () => {
    const { unmount } = render(
      await KhataList({ page: page([]), basePath: '/store/khata', search: '', showAll: false }),
    );
    expect(screen.getByText('Nobody owes anything right now.')).toBeInTheDocument();
    unmount();
    render(
      await KhataList({ page: page([]), basePath: '/store/khata', search: '0300', showAll: true }),
    );
    expect(screen.getByText('No khata matches that search.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include paid-up khatas' })).toBeChecked();
  });

  it('pages through long lists, keeping the search', async () => {
    render(
      await KhataList({
        page: { ...page([khata], 75), page: 2 },
        basePath: '/store/khata',
        search: 'bil',
        showAll: true,
      }),
    );
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/store/khata?q=bil&all=1&page=1',
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/store/khata?q=bil&all=1&page=3',
    );
  });

  it('has no "previous" on the first page and no "next" on the last', async () => {
    const { unmount } = render(
      await KhataList({
        page: { ...page([khata], 45), page: 1 },
        basePath: '/store/khata',
        search: '',
        showAll: false,
      }),
    );
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/store/khata?page=2',
    );
    unmount();
    render(
      await KhataList({
        page: { ...page([khata], 45), page: 2 },
        basePath: '/store/khata',
        search: '',
        showAll: false,
      }),
    );
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument();
  });
});

describe('khata entries', () => {
  it('staff see who made each entry and open receipts by order id', async () => {
    render(await KhataEntries({ entries: khata.entries, audience: 'staff' }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[0] as HTMLElement).getByText('By')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('−Rs. 300')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Cash')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByRole('link', { name: 'Receipt' })).toHaveAttribute(
      'href',
      '/api/v1/khata/entries/e2/receipt',
    );
    expect(within(rows[2] as HTMLElement).getByRole('link', { name: 'Receipt' })).toHaveAttribute(
      'href',
      '/api/v1/store/orders/o1/receipt',
    );
    // Corrections have no receipt of their own.
    expect(within(rows[3] as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
  });

  it('customers open receipts by tracking link and never see staff names', async () => {
    render(await KhataEntries({ entries: khata.entries, audience: 'customer' }));
    expect(screen.queryByText('By')).not.toBeInTheDocument();
    expect(screen.queryByText('Ahmed')).not.toBeInTheDocument();
    const orderRow = screen.getAllByRole('row')[2] as HTMLElement;
    expect(within(orderRow).getByRole('link', { name: 'Receipt' })).toHaveAttribute(
      'href',
      '/api/v1/orders/t1/receipt',
    );
  });

  it('on a phone, each entry is a card with its date, amount, balance and receipt', async () => {
    render(await KhataEntries({ entries: khata.entries, audience: 'staff' }));
    const cards = within(screen.getByRole('list', { name: 'History' })).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('Payment');
    expect(cards[0]).toHaveTextContent('by Ahmed');
    expect(cards[0]).toHaveTextContent('−Rs. 300');
    expect(cards[0]).toHaveTextContent('Balance Rs. 490');
    expect(within(cards[1] as HTMLElement).getByRole('link', { name: 'Receipt' })).toHaveAttribute(
      'href',
      '/api/v1/store/orders/o1/receipt',
    );
  });

  it('says when there are none', async () => {
    render(await KhataEntries({ entries: [], audience: 'customer' }));
    expect(screen.getByText('No entries yet.')).toBeInTheDocument();
  });
});
