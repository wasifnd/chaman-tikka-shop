// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  click,
  nextCall,
  renderAdmin,
  typeInto,
  useApiMock,
} from '@/features/admin/testing/harness';
import { staffApi } from '../client';
import { KhataActions } from './KhataActions';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
beforeEach(() => {
  router.refresh.mockReset();
});

const ID = 'k1';
const show = (isAdmin: boolean, creditLimit: number | null = null) =>
  renderAdmin(
    <KhataActions
      khataId={ID}
      balance={790}
      creditLimit={creditLimit}
      defaultLimit={10_000}
      isAdmin={isAdmin}
    />,
  );

describe('khata actions', () => {
  const api = useApiMock();

  it('staff take a payment, and the page reloads its numbers', async () => {
    api.succeed('POST', `/api/v1/store/khata/${ID}/payments`, { change: {} }, 201);
    show(false);
    expect(screen.queryByRole('heading', { name: 'Correct the khata' })).not.toBeInTheDocument();
    expect(screen.getByText('Owes Rs. 790 now.')).toBeInTheDocument();
    typeInto('Amount received (Rs.)', '300');
    typeInto('Note (optional)', 'cash');
    click('Save payment');
    const call = await nextCall(api, 'POST');
    expect(call?.body).toEqual({
      amount: 300,
      note: 'cash',
      requestKey: expect.any(String) as unknown,
    });
    expect(await screen.findByText('Payment saved.')).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByLabelText('Amount received (Rs.)')).toHaveValue(null);
  });

  it('a retry after a lost reply sends the same key, so the payment counts once', async () => {
    api.fail('POST', `/api/v1/store/khata/${ID}/payments`, 'NETWORK_ERROR', 'No connection.', 503);
    show(false);
    typeInto('Amount received (Rs.)', '300');
    click('Save payment');
    await screen.findByText('No connection.');
    api.succeed('POST', `/api/v1/store/khata/${ID}/payments`, { change: {} }, 200);
    click('Save payment');
    await screen.findByText('Payment saved.');
    const keys = api.calls.map((c) => (c.body as { requestKey: string }).requestKey);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('a write-off refused because the balance moved reloads the page', async () => {
    api.fail(
      'POST',
      `/api/v1/admin/khata/${ID}/adjustments`,
      'BALANCE_CHANGED',
      'The balance is now Rs. 2,790. Check it and write off again.',
      409,
    );
    show(true);
    fireEvent.change(screen.getByLabelText('Correction'), { target: { value: 'WRITE_OFF' } });
    typeInto('Reason', 'Goodwill');
    click('Save correction');
    await screen.findByText('The balance is now Rs. 2,790. Check it and write off again.');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('shows why a payment was refused, next to the field', async () => {
    api.fail(
      'POST',
      `/api/v1/store/khata/${ID}/payments`,
      'MORE_THAN_OWED',
      'That is more than is owed.',
      409,
      { amount: 'At most Rs. 790' },
    );
    show(false);
    typeInto('Amount received (Rs.)', '900');
    click('Save payment');
    expect(await screen.findByText('At most Rs. 790')).toBeInTheDocument();
    expect(screen.getByText('That is more than is owed.')).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('admin corrects with a reason; a write-off sends no amount', async () => {
    api.succeed('POST', `/api/v1/admin/khata/${ID}/adjustments`, { change: {} }, 201);
    show(true);
    typeInto('Amount', '90');
    typeInto('Reason', 'Wrong naan count');
    click('Save correction');
    expect((await nextCall(api, 'POST'))?.body).toEqual({
      kind: 'CHARGE',
      amount: 90,
      reason: 'Wrong naan count',
      requestKey: expect.any(String) as unknown,
    });

    fireEvent.change(screen.getByLabelText('Correction'), { target: { value: 'WRITE_OFF' } });
    expect(screen.getByText('This clears the whole balance of Rs. 790.')).toBeInTheDocument();
    typeInto('Reason', 'Goodwill');
    click('Save correction');
    await screen.findByText('Correction saved.');
    expect(api.calls.at(-1)?.body).toEqual({
      kind: 'WRITE_OFF',
      reason: 'Goodwill',
      expectedBalance: 790,
      requestKey: expect.any(String) as unknown,
    });
    // Each saved change gets its own key.
    const keys = api.calls.map((c) => (c.body as { requestKey: string }).requestKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("admin sets a customer's own limit, or puts them back on the default", async () => {
    api.succeed('PATCH', `/api/v1/admin/khata/${ID}`);
    show(true, 2_500);
    expect(screen.getByLabelText('Limit (Rs.)')).toHaveValue(2500);
    typeInto('Limit (Rs.)', '3000');
    click('Save limit');
    expect((await nextCall(api, 'PATCH'))?.body).toEqual({ creditLimit: 3000 });
    click('Use the shop default');
    await screen.findByText('Limit saved.');
    expect(api.calls.at(-1)?.body).toEqual({ creditLimit: null });
  });
});

describe('staffApi', () => {
  it('reports a network failure plainly', async () => {
    const result = await staffApi('/x', {}, () => Promise.reject(new Error('offline')));
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'NETWORK_ERROR' }) as unknown,
    });
  });

  it('copes with a reply that is not JSON', async () => {
    const result = await staffApi('/x', {}, () => Promise.resolve(new Response('oops')));
    expect(result.ok).toBe(false);
  });

  it('renews an expired login once, then retries', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ success: true, data: { fine: true } }));
    const result = await staffApi('/x', { method: 'POST', body: { a: 1 } }, fetcher);
    expect(result).toEqual({ ok: true, data: { fine: true } });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('falls back to a general error when the server gives none', async () => {
    const result = await staffApi('/x', {}, () =>
      Promise.resolve(Response.json({ success: false }, { status: 500 })),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    });
  });
});
