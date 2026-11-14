import { inflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ADMIN, STAFF, newApi, randomPhone, signUp, signedIn, type Api } from './support/client';
import { kababLine, loadWorld, naanLine, quote, type World } from './support/world';

/** The text drawn on a PDF the app returned. */
async function pdfText(api: Api, path: string): Promise<{ status: number; text: string }> {
  const response = await api.context.fetch(path);
  const raw = (await response.body()).toString('latin1');
  const chunks: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const body = Buffer.from(match[1] ?? '', 'latin1');
    let content: string;
    try {
      content = inflateSync(body).toString('latin1');
    } catch {
      content = body.toString('latin1');
    }
    for (const hex of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      chunks.push(Buffer.from(hex[1] ?? '', 'hex').toString('latin1'));
    }
  }
  return { status: response.status(), text: chunks.join('\n') };
}

interface CounterReply {
  id: string;
  orderNumber: string;
  trackingToken: string;
  status: string;
  grandTotal: number;
  amountPaid: number;
  remaining: number;
  khata: { id: string; balance: number } | null;
}

interface KhataView {
  id: string;
  phone: string;
  name: string;
  balance: number;
  limit: number;
  creditLimit: number | null;
  entries: {
    id: string;
    kind: string;
    amount: number;
    balanceAfter: number;
    by: string | null;
    note: string | null;
    order: { id: string; orderNumber: string; trackingToken: string } | null;
  }[];
}

/**
 * The khata: staff take counter orders paid in full, in part or not at all; what's unpaid goes
 * on the customer's khata by phone number, within a limit. Staff take payments; only admin
 * corrects; the customer sees their own khata, read-only.
 */
test.describe('khata', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  let world: World;
  let staff: Api;
  let admin: Api;
  const phone = randomPhone();
  let khataId = '';
  let firstOrder: CounterReply;

  test.beforeAll(async () => {
    world = loadWorld();
    staff = await signedIn(STAFF);
    admin = await signedIn(ADMIN);
  });

  test.afterAll(async () => {
    await Promise.all([staff.dispose(), admin.dispose()]);
  });

  /** A counter order of kabab and naan, priced the way the till prices it. */
  async function counterOrder(
    api: Api,
    body: { amountPaid: number | 'all'; customer?: { name?: string; phone?: string } },
    orderType: 'PICKUP' | 'DINE_IN' = 'PICKUP',
  ) {
    const lines = [kababLine(world), naanLine(world, 2)];
    const { grandTotal } = await quote(api, { lines, orderType });
    return api.post('/api/v1/store/counter-orders', {
      idempotencyKey: randomUUID(),
      lines,
      orderType,
      expectedTotal: grandTotal,
      amountPaid: body.amountPaid === 'all' ? grandTotal : body.amountPaid,
      customer: body.customer ?? {},
    });
  }

  const order = (reply: { data: Record<string, unknown> | null }) =>
    (reply.data as { order: CounterReply }).order;

  test('a walk-in paying in full: an accepted, paid order and no khata', async () => {
    const reply = await counterOrder(staff, { amountPaid: 'all' }, 'DINE_IN');
    expect(reply.status, reply.text).toBe(201);
    const placed = order(reply);
    expect(placed).toMatchObject({ status: 'CONFIRMED', remaining: 0, khata: null });

    // It goes straight to the kitchen, already accepted.
    const board = (await staff.get('/api/v1/store/orders')).data as {
      orders: { id: string; status: string; paymentStatus: string; source: string }[];
    };
    expect(board.orders.find((o) => o.id === placed.id)).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      source: 'COUNTER',
    });
    const receipt = await pdfText(staff, `/api/v1/store/orders/${placed.id}/receipt`);
    expect(receipt.text).toContain('Walk-in customer');
    expect(receipt.text).toContain('Remaining');
  });

  test('a busy till can re-price the ticket on every tap; the public still has a limit', async () => {
    const lines = [naanLine(world, 1)];
    const staffReplies = await Promise.all(
      Array.from({ length: 70 }, () =>
        staff.post('/api/v1/cart/quote', { lines, orderType: 'PICKUP' }),
      ),
    );
    expect(staffReplies.every((reply) => reply.status === 200)).toBe(true);

    const visitor = await newApi();
    const visitorReplies = await Promise.all(
      Array.from({ length: 70 }, () =>
        visitor.post('/api/v1/cart/quote', { lines, orderType: 'PICKUP' }),
      ),
    );
    expect(visitorReplies.some((reply) => reply.status === 429)).toBe(true);
    await visitor.dispose();
  });

  test('part paid: the rest opens a khata for that number', async () => {
    const lookup = await staff.get(`/api/v1/store/khata/lookup?phone=${phone}`);
    expect(lookup.data).toMatchObject({ khata: null });

    const { grandTotal } = await quote(staff, {
      lines: [kababLine(world), naanLine(world, 2)],
      orderType: 'PICKUP',
    });
    const reply = await counterOrder(staff, {
      amountPaid: 100,
      customer: { name: 'Khata Customer', phone },
    });
    expect(reply.status, reply.text).toBe(201);
    firstOrder = order(reply);
    expect(firstOrder).toMatchObject({ amountPaid: 100, remaining: grandTotal - 100 });
    khataId = firstOrder.khata?.id ?? '';
    expect(firstOrder.khata?.balance).toBe(grandTotal - 100);

    const after = (await staff.get(`/api/v1/store/khata/lookup?phone=${phone}`)).data as {
      khata: KhataView;
    };
    expect(after.khata).toMatchObject({ name: 'Khata Customer', balance: grandTotal - 100 });

    const receipt = await pdfText(staff, `/api/v1/store/orders/${firstOrder.id}/receipt`);
    expect(receipt.text).toContain('On khata');
    expect(receipt.text).toContain('The remaining amount was added to your khata.');
  });

  test('anything unpaid needs the number and name', async () => {
    const reply = await counterOrder(staff, { amountPaid: 0 });
    expect(reply.status).toBe(422);
  });

  test('the limit stops a khata growing past it, and nothing is kept', async () => {
    const before = (await staff.get(`/api/v1/store/khata/${khataId}`)).data as { khata: KhataView };
    // Admin gives this customer a tight limit of their own.
    const limit = before.khata.balance + 10;
    expect(
      (await admin.patch(`/api/v1/admin/khata/${khataId}`, { creditLimit: limit })).status,
    ).toBe(200);
    const refused = await counterOrder(staff, {
      amountPaid: 0,
      customer: { name: 'Khata Customer', phone },
    });
    expect(refused.status).toBe(409);
    expect(refused.error?.code).toBe('KHATA_LIMIT_REACHED');
    const after = (await staff.get(`/api/v1/store/khata/${khataId}`)).data as { khata: KhataView };
    expect(after.khata.balance).toBe(before.khata.balance);
    expect(after.khata.entries).toHaveLength(before.khata.entries.length);

    // Back to the shop default.
    expect(
      (await admin.patch(`/api/v1/admin/khata/${khataId}`, { creditLimit: null })).status,
    ).toBe(200);
  });

  test('a second unpaid order adds to the same khata', async () => {
    const reply = await counterOrder(staff, {
      amountPaid: 0,
      customer: { name: 'Khata Customer', phone },
    });
    expect(reply.status, reply.text).toBe(201);
    const placed = order(reply);
    expect(placed.khata?.id).toBe(khataId);
    expect(placed.khata?.balance).toBe(firstOrder.remaining + placed.grandTotal);
  });

  test('cancelling an order that went on a khata takes its charge back off', async () => {
    const reply = await counterOrder(staff, {
      amountPaid: 0,
      customer: { name: 'Khata Customer', phone },
    });
    expect(reply.status, reply.text).toBe(201);
    const placed = order(reply);
    const owedWithIt = placed.khata?.balance ?? 0;

    const cancel = await staff.patch(`/api/v1/store/orders/${placed.id}/status`, {
      status: 'CANCELLED',
      reason: 'Customer changed their mind',
    });
    expect(cancel.status, cancel.text).toBe(200);
    expect((cancel.data as { result: { khataReversed: number } }).result.khataReversed).toBe(
      placed.grandTotal,
    );
    const { khata } = (await staff.get(`/api/v1/store/khata/${khataId}`)).data as {
      khata: KhataView;
    };
    expect(khata.balance).toBe(owedWithIt - placed.grandTotal);
    expect(khata.entries[0]).toMatchObject({
      kind: 'REDUCTION',
      amount: -placed.grandTotal,
      note: `Order ${placed.orderNumber} cancelled`,
    });
  });

  test('staff take a payment, with a receipt', async () => {
    const before = (await staff.get(`/api/v1/store/khata/${khataId}`)).data as { khata: KhataView };
    const tooMuch = await staff.post(`/api/v1/store/khata/${khataId}/payments`, {
      amount: before.khata.balance + 1,
      requestKey: randomUUID(),
    });
    expect(tooMuch.status).toBe(409);

    const requestKey = randomUUID();
    const reply = await staff.post(`/api/v1/store/khata/${khataId}/payments`, {
      amount: 200,
      note: 'Cash at the counter',
      requestKey,
    });
    expect(reply.status, reply.text).toBe(201);
    // The reply was "lost" and the cashier pressed Save again: still one payment.
    const again = await staff.post(`/api/v1/store/khata/${khataId}/payments`, {
      amount: 200,
      note: 'Cash at the counter',
      requestKey,
    });
    expect(again.status, again.text).toBe(200);
    expect((again.data as { change: { replayed: boolean } }).change.replayed).toBe(true);
    const after = (await staff.get(`/api/v1/store/khata/${khataId}`)).data as { khata: KhataView };
    expect(after.khata.balance).toBe(before.khata.balance - 200);
    const payment = after.khata.entries[0];
    expect(payment).toMatchObject({ kind: 'PAYMENT', amount: -200, note: 'Cash at the counter' });
    expect(payment?.by).toBe(STAFF.phone);

    const receipt = await pdfText(staff, `/api/v1/khata/entries/${payment?.id ?? ''}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.text).toContain('KHATA PAYMENT');
    expect(receipt.text).toContain('Received by');
  });

  test('the list shows who owes, biggest first, and finds a number', async () => {
    const list = (await staff.get(`/api/v1/store/khata?q=${phone}`)).data as {
      items: KhataView[];
      total: number;
    };
    expect(list.items.map((k) => k.id)).toEqual([khataId]);
    const all = (await staff.get('/api/v1/store/khata')).data as { items: KhataView[] };
    const balances = all.items.map((k) => k.balance);
    expect(balances).toEqual([...balances].sort((a, b) => b - a));
    // The pages render for staff and admin.
    expect((await staff.get('/store/khata')).status).toBe(200);
    expect((await staff.get(`/store/khata/${khataId}`)).status).toBe(200);
    expect((await admin.get(`/admin/khata/${khataId}`)).status).toBe(200);
    expect((await staff.get('/store/counter')).status).toBe(200);
    // A khata that doesn't exist is a real 404, on both panels.
    expect((await staff.page(`/store/khata/${randomUUID()}`)).status).toBe(404);
    expect((await admin.page(`/admin/khata/${randomUUID()}`)).status).toBe(404);
    expect((await admin.page('/admin/khata/not-a-uuid')).status).toBe(404);
  });

  test('only admin corrects, always with a reason', async () => {
    const staffTry = await staff.post(`/api/v1/admin/khata/${khataId}/adjustments`, {
      kind: 'WRITE_OFF',
      reason: 'Nice try',
      requestKey: randomUUID(),
      expectedBalance: 0,
    });
    expect(staffTry.status).toBe(403);
    expect((await staff.patch(`/api/v1/admin/khata/${khataId}`, { creditLimit: 1 })).status).toBe(
      403,
    );

    const noReason = await admin.post(`/api/v1/admin/khata/${khataId}/adjustments`, {
      kind: 'CHARGE',
      amount: 50,
      reason: '',
      requestKey: randomUUID(),
    });
    expect(noReason.status).toBe(422);

    const before = (await admin.get(`/api/v1/store/khata/${khataId}`)).data as { khata: KhataView };
    const charge = await admin.post(`/api/v1/admin/khata/${khataId}/adjustments`, {
      kind: 'CHARGE',
      amount: 50,
      reason: 'Extra raita taken home',
      requestKey: randomUUID(),
    });
    expect(charge.status, charge.text).toBe(201);
    const reduce = await admin.post(`/api/v1/admin/khata/${khataId}/adjustments`, {
      kind: 'REDUCTION',
      amount: 30,
      reason: 'Naan was cold',
      requestKey: randomUUID(),
    });
    expect(reduce.status).toBe(201);
    const after = (await admin.get(`/api/v1/store/khata/${khataId}`)).data as { khata: KhataView };
    expect(after.khata.balance).toBe(before.khata.balance + 20);
    expect(after.khata.entries.slice(0, 2).map((e) => [e.kind, e.note, e.by])).toEqual([
      ['REDUCTION', 'Naan was cold', ADMIN.phone],
      ['CHARGE', 'Extra raita taken home', ADMIN.phone],
    ]);
  });

  test('statements download as PDF and as a spreadsheet', async () => {
    const pdf = await pdfText(staff, `/api/v1/store/khata/${khataId}/statement`);
    expect(pdf.status).toBe(200);
    expect(pdf.text).toContain('KHATA STATEMENT');
    expect(pdf.text).toContain(firstOrder.orderNumber);
    const csv = await staff.get(`/api/v1/store/khata/${khataId}/statement?format=csv`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toBe(`attachment; filename="khata-${phone}.csv"`);
    expect(csv.text).toContain('Date (Lahore),Type,Order,Note,Amount,Balance after,By');
    expect(csv.text).toContain('Balance owed');
  });

  test('customers and visitors can do none of the staff work', async () => {
    const visitor = await newApi();
    expect((await visitor.get(`/api/v1/store/khata/${khataId}`)).status).toBe(401);
    expect((await counterOrder(visitor, { amountPaid: 'all' })).status).toBe(401);

    const customer = await newApi();
    await signUp(customer, { name: 'Curious Customer', password: 'correct-horse-9' });
    expect((await counterOrder(customer, { amountPaid: 'all' })).status).toBe(403);
    expect(
      (await customer.post(`/api/v1/store/khata/${khataId}/payments`, { amount: 1 })).status,
    ).toBe(403);
    expect((await customer.get('/api/v1/store/khata')).status).toBe(403);
    // Someone else's payment receipt "doesn't exist" for them.
    const mine = (await staff.get(`/api/v1/store/khata/${khataId}`)).data as { khata: KhataView };
    const paymentId = mine.khata.entries.find((e) => e.kind === 'PAYMENT')?.id ?? '';
    expect((await customer.get(`/api/v1/khata/entries/${paymentId}/receipt`)).status).toBe(404);
    // And they have no khata of their own.
    expect((await customer.get('/api/v1/account/khata')).data).toEqual({ khata: null });
    await Promise.all([visitor.dispose(), customer.dispose()]);
  });

  test('the customer who owns the number sees their khata, read-only', async () => {
    const owner = await newApi();
    const reply = await signUp(owner, {
      name: 'Khata Customer',
      phone,
      password: 'correct-horse-9',
    });
    expect(reply.status, reply.text).toBe(201);

    const { khata } = (await owner.get('/api/v1/account/khata')).data as { khata: KhataView };
    const staffView = (await staff.get(`/api/v1/store/khata/${khataId}`)).data as {
      khata: KhataView;
    };
    expect(khata.balance).toBe(staffView.khata.balance);
    expect(khata.entries).toHaveLength(staffView.khata.entries.length);
    // Staff names stay with the shop.
    expect(khata.entries.every((e) => e.by === null)).toBe(true);

    // Their own order receipts and payment receipts open in full.
    const orderReceipt = await pdfText(owner, `/api/v1/orders/${firstOrder.trackingToken}/receipt`);
    expect(orderReceipt.text).toContain(phone);
    const paymentId = khata.entries.find((e) => e.kind === 'PAYMENT')?.id ?? '';
    const paymentReceipt = await pdfText(owner, `/api/v1/khata/entries/${paymentId}/receipt`);
    expect(paymentReceipt.status).toBe(200);
    expect(paymentReceipt.text).not.toContain('Received by');

    const statement = await owner.get('/api/v1/account/khata/statement?format=csv');
    expect(statement.status).toBe(200);
    expect((await owner.get('/account/khata')).status).toBe(200);

    // Read-only: none of the staff or admin endpoints work for them.
    expect(
      (await owner.post(`/api/v1/store/khata/${khataId}/payments`, { amount: 1 })).status,
    ).toBe(403);
    expect(
      (
        await owner.post(`/api/v1/admin/khata/${khataId}/adjustments`, {
          kind: 'WRITE_OFF',
          reason: 'Mine now',
        })
      ).status,
    ).toBe(403);
    await owner.dispose();
  });

  test('admin can write off the rest, but only the balance they saw', async () => {
    const { khata: before } = (await admin.get(`/api/v1/store/khata/${khataId}`)).data as {
      khata: KhataView;
    };
    const stale = await admin.post(`/api/v1/admin/khata/${khataId}/adjustments`, {
      kind: 'WRITE_OFF',
      reason: 'Settled in person',
      requestKey: randomUUID(),
      expectedBalance: before.balance - 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.error?.code).toBe('BALANCE_CHANGED');

    const reply = await admin.post(`/api/v1/admin/khata/${khataId}/adjustments`, {
      kind: 'WRITE_OFF',
      reason: 'Settled in person',
      requestKey: randomUUID(),
      expectedBalance: before.balance,
    });
    expect(reply.status, reply.text).toBe(201);
    const { khata } = (await admin.get(`/api/v1/store/khata/${khataId}`)).data as {
      khata: KhataView;
    };
    expect(khata.balance).toBe(0);
    // Paid up: off the default list, still found with "include paid-up".
    const owing = (await admin.get(`/api/v1/store/khata?q=${phone}`)).data as { total: number };
    expect(owing.total).toBe(0);
    const all = (await admin.get(`/api/v1/store/khata?q=${phone}&all=1`)).data as {
      total: number;
    };
    expect(all.total).toBe(1);
  });
});
