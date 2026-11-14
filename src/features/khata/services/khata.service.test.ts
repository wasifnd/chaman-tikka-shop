import { describe, expect, it } from 'vitest';
import type { KhataStore, KhataTx, LockedKhata, NewKhataEntry } from './khata.ports';
import { createKhataService } from './khata.service';

const AT = new Date('2026-11-14T15:00:00Z');
const key = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** An in-memory khata store that, like the database, keeps nothing from a failed change. */
function fakeStore(initial: LockedKhata[]) {
  let khatas = new Map(initial.map((k) => [k.id, { ...k }]));
  const entries: (NewKhataEntry & { id: string })[] = [];
  const tx: KhataTx = {
    lock(id) {
      const found = khatas.get(id);
      return Promise.resolve(found ? { ...found } : null);
    },
    lockOrOpen: () => Promise.reject(new Error('not used here')),
    addEntry(entry) {
      const id = `entry-${String(entries.length + 1)}`;
      entries.push({ ...entry, id });
      const khata = khatas.get(entry.khataId);
      if (khata) khata.balance = entry.balanceAfter;
      return Promise.resolve({ id });
    },
    findByRequestKey(requestKey) {
      const found = entries.find((e) => e.requestKey === requestKey);
      return Promise.resolve(
        found
          ? {
              id: found.id,
              khataId: found.khataId,
              amount: found.amount,
              balanceAfter: found.balanceAfter,
            }
          : null,
      );
    },
    defaultLimit: () => Promise.resolve(10_000),
  };
  const store: KhataStore = {
    async transaction(work) {
      const snapshot = new Map([...khatas].map(([id, k]) => [id, { ...k }]));
      const count = entries.length;
      try {
        return await work(tx);
      } catch (error) {
        khatas = snapshot;
        entries.length = count;
        throw error;
      }
    },
  };
  return { store, entries, balance: (id: string) => khatas.get(id)?.balance };
}

const bilal: LockedKhata = {
  id: 'k1',
  phone: '03331234500',
  name: 'Bilal',
  balance: 790,
  creditLimit: null,
};

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error as { code: string; status: number },
  );
}

describe('khata payments', () => {
  it('records a payment against the staff member and lowers the balance', async () => {
    const fake = fakeStore([bilal]);
    const service = createKhataService(fake.store, () => AT);
    const change = await service.recordPayment(
      'k1',
      { amount: 300, note: 'cash', requestKey: key(1) },
      'staff-1',
    );
    expect(change).toEqual({
      entryId: 'entry-1',
      khataId: 'k1',
      amount: -300,
      balance: 490,
      replayed: false,
    });
    expect(fake.entries[0]).toEqual({
      id: 'entry-1',
      khataId: 'k1',
      kind: 'PAYMENT',
      amount: -300,
      balanceAfter: 490,
      orderId: null,
      note: 'cash',
      userId: 'staff-1',
      at: AT,
      requestKey: key(1),
    });
  });

  it('keeps a missing note as null', async () => {
    const fake = fakeStore([bilal]);
    await createKhataService(fake.store).recordPayment(
      'k1',
      { amount: 790, requestKey: key(1) },
      'staff-1',
    );
    expect(fake.entries[0]?.note).toBeNull();
    expect(fake.balance('k1')).toBe(0);
  });

  it('pressing Save again after a lost reply records the payment once', async () => {
    const fake = fakeStore([bilal]);
    const service = createKhataService(fake.store);
    const first = await service.recordPayment('k1', { amount: 300, requestKey: key(1) }, 's');
    const again = await service.recordPayment('k1', { amount: 300, requestKey: key(1) }, 's');
    expect(again).toEqual({ ...first, replayed: true });
    expect(fake.entries).toHaveLength(1);
    expect(fake.balance('k1')).toBe(490);
  });

  it('refuses a request key already used on another khata', async () => {
    const fake = fakeStore([bilal, { ...bilal, id: 'k2', phone: '03001112223' }]);
    const service = createKhataService(fake.store);
    await service.recordPayment('k1', { amount: 100, requestKey: key(1) }, 's');
    const error = await rejection(
      service.recordPayment('k2', { amount: 100, requestKey: key(1) }, 's'),
    );
    expect(error).toMatchObject({ code: 'REQUEST_KEY_REUSED', status: 409 });
    expect(fake.balance('k2')).toBe(790);
  });

  it('refuses more than is owed and writes nothing', async () => {
    const fake = fakeStore([bilal]);
    const error = await rejection(
      createKhataService(fake.store).recordPayment(
        'k1',
        { amount: 1000, requestKey: key(1) },
        'staff-1',
      ),
    );
    expect(error.code).toBe('MORE_THAN_OWED');
    expect(fake.entries).toHaveLength(0);
    expect(fake.balance('k1')).toBe(790);
  });

  it('says when the khata does not exist', async () => {
    const fake = fakeStore([]);
    const error = await rejection(
      createKhataService(fake.store).recordPayment(
        'nope',
        { amount: 1, requestKey: key(1) },
        'staff-1',
      ),
    );
    expect(error).toMatchObject({ code: 'KHATA_NOT_FOUND', status: 404 });
  });
});

describe('admin corrections', () => {
  it('a charge adds to the balance with the reason as its note, even past the limit', async () => {
    const fake = fakeStore([{ ...bilal, balance: 9_900 }]);
    const change = await createKhataService(fake.store, () => AT).adjust(
      'k1',
      { kind: 'CHARGE', amount: 500, reason: 'Catering tray', requestKey: key(1) },
      'admin-1',
    );
    expect(change.balance).toBe(10_400);
    expect(fake.entries[0]).toMatchObject({
      kind: 'CHARGE',
      note: 'Catering tray',
      userId: 'admin-1',
    });
  });

  it('a reduction takes some off', async () => {
    const fake = fakeStore([bilal]);
    const change = await createKhataService(fake.store).adjust(
      'k1',
      { kind: 'REDUCTION', amount: 90, reason: 'Wrong naan count', requestKey: key(1) },
      'admin-1',
    );
    expect(change).toMatchObject({ amount: -90, balance: 700 });
  });

  it('a write-off clears everything owed when the balance is still what the admin saw', async () => {
    const fake = fakeStore([bilal]);
    const change = await createKhataService(fake.store).adjust(
      'k1',
      { kind: 'WRITE_OFF', reason: 'Regular, goodwill', requestKey: key(1), expectedBalance: 790 },
      'admin-1',
    );
    expect(change).toMatchObject({ amount: -790, balance: 0 });
  });

  it('refuses a write-off when the balance moved since the admin looked', async () => {
    const fake = fakeStore([{ ...bilal, balance: 2_790 }]); // an order landed meanwhile
    const service = createKhataService(fake.store);
    const error = await rejection(
      service.adjust(
        'k1',
        { kind: 'WRITE_OFF', reason: 'Goodwill', requestKey: key(1), expectedBalance: 790 },
        'admin-1',
      ),
    );
    expect(error).toMatchObject({ code: 'BALANCE_CHANGED', status: 409 });
    const noneGiven = await rejection(
      service.adjust('k1', { kind: 'WRITE_OFF', reason: 'Goodwill', requestKey: key(2) }, 'a'),
    );
    expect(noneGiven.code).toBe('BALANCE_CHANGED');
    expect(fake.entries).toHaveLength(0);
  });

  it('a repeated correction is recorded once', async () => {
    const fake = fakeStore([bilal]);
    const service = createKhataService(fake.store);
    const request = { kind: 'CHARGE' as const, amount: 50, reason: 'Raita', requestKey: key(7) };
    await service.adjust('k1', request, 'admin-1');
    const again = await service.adjust('k1', request, 'admin-1');
    expect(again.replayed).toBe(true);
    expect(fake.balance('k1')).toBe(840);
  });

  it('refuses a reduction larger than the balance', async () => {
    const fake = fakeStore([bilal]);
    const error = await rejection(
      createKhataService(fake.store).adjust(
        'k1',
        { kind: 'REDUCTION', amount: 800, reason: 'Too much', requestKey: key(1) },
        'admin-1',
      ),
    );
    expect(error.code).toBe('MORE_THAN_OWED');
    expect(fake.entries).toHaveLength(0);
  });

  it('says when the khata does not exist', async () => {
    const error = await rejection(
      createKhataService(fakeStore([]).store).adjust(
        'nope',
        { kind: 'WRITE_OFF', reason: 'Gone', requestKey: key(1), expectedBalance: 0 },
        'admin-1',
      ),
    );
    expect(error.code).toBe('KHATA_NOT_FOUND');
  });
});
