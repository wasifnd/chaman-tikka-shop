// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';
import type { KhataDetail } from '../types/khata.types';
import { KhataDetailView } from './KhataDetailView';

vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) =>
    Promise.resolve(createTranslator({ locale: 'en', messages, namespace: namespace as 'khata' })),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The history table is an async server component (tested on its own); a client render can't run it.
vi.mock('./KhataEntries', () => ({
  KhataEntries: ({ entries }: { entries: unknown[] }) => <p>{entries.length} entries</p>,
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
  entries: [],
};

describe('one khata', () => {
  const show = async (isAdmin: boolean) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {await KhataDetailView({ khata, basePath: '/store/khata', isAdmin, defaultLimit: 10_000 })}
      </NextIntlClientProvider>,
    );

  it('staff see the balance, statements and payments, but no corrections', async () => {
    await show(false);
    expect(screen.getByRole('heading', { name: 'Bilal' })).toBeInTheDocument();
    expect(screen.getByText('Rs. 490')).toBeInTheDocument();
    expect(screen.getByText('0 entries')).toBeInTheDocument();
    expect(screen.getByText('Rs. 2,500 (own limit)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download statement (Excel)' })).toHaveAttribute(
      'href',
      '/api/v1/store/khata/k1/statement?format=csv',
    );
    expect(screen.getByRole('heading', { name: 'Take a payment' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Correct the khata' })).not.toBeInTheDocument();
  });

  it('admin also get corrections and the limit', async () => {
    await show(true);
    expect(screen.getByRole('heading', { name: 'Correct the khata' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Limit for this customer' })).toBeInTheDocument();
  });

  it('a paid-up khata shows its balance in green', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {await KhataDetailView({
          khata: { ...khata, balance: 0, creditLimit: null },
          basePath: '/store/khata',
          isAdmin: false,
          defaultLimit: 10_000,
        })}
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Rs. 0')).toHaveClass('text-green-400');
  });
});
