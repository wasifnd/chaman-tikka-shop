import { describe, expect, it } from 'vitest';
import { resolveOrderOwner, type OrderPhoneDeps } from './order-phone';

const PHONE = '03001234567';
const proven = new Date('2026-11-14T15:00:00Z');
const accountProven = new Date('2026-11-01T10:00:00Z');

function deps(overrides: Partial<OrderPhoneDeps> = {}): OrderPhoneDeps {
  return {
    provenAt: (id, phone) => Promise.resolve(id === 'check' && phone === PHONE ? proven : null),
    accountPhone: () => Promise.resolve({ phone: PHONE, verifiedAt: accountProven }),
    customerFor: (phone) => Promise.resolve(phone === PHONE ? 'owner' : null),
    ...overrides,
  };
}

describe('resolveOrderOwner', () => {
  it('refuses a guest order whose number was not proven', async () => {
    await expect(
      resolveOrderOwner({ phone: PHONE, customerId: null }, deps()),
    ).rejects.toMatchObject({
      code: 'PHONE_NOT_VERIFIED',
      details: { 'contact.phone': 'Verify this number on WhatsApp first' },
    });
    await expect(
      resolveOrderOwner({ phone: PHONE, verificationId: 'other', customerId: null }, deps()),
    ).rejects.toMatchObject({ code: 'PHONE_NOT_VERIFIED' });
  });

  it('gives a proven guest order to the account that signs in with that number', async () => {
    expect(
      await resolveOrderOwner({ phone: PHONE, verificationId: 'check', customerId: null }, deps()),
    ).toEqual({ customerId: 'owner', phoneVerifiedAt: proven });
  });

  it('leaves a proven guest order unlinked when no account has the number', async () => {
    expect(
      await resolveOrderOwner(
        { phone: PHONE, verificationId: 'check', customerId: null },
        deps({ customerFor: () => Promise.resolve(null) }),
      ),
    ).toEqual({ customerId: null, phoneVerifiedAt: proven });
  });

  it("needs no new check for the signed-in customer's own proven number", async () => {
    expect(await resolveOrderOwner({ phone: PHONE, customerId: 'me' }, deps())).toEqual({
      customerId: 'me',
      phoneVerifiedAt: accountProven,
    });
  });

  it('asks a signed-in customer to prove a different number, or an unproven own number', async () => {
    await expect(
      resolveOrderOwner(
        { phone: PHONE, customerId: 'me' },
        deps({ accountPhone: () => Promise.resolve({ phone: '03451234567', verifiedAt: proven }) }),
      ),
    ).rejects.toMatchObject({ code: 'PHONE_NOT_VERIFIED' });
    await expect(
      resolveOrderOwner(
        { phone: PHONE, customerId: 'me' },
        deps({ accountPhone: () => Promise.resolve({ phone: PHONE, verifiedAt: null }) }),
      ),
    ).rejects.toMatchObject({ code: 'PHONE_NOT_VERIFIED' });
  });

  it('keeps a signed-in order in the signed-in account, even with another proven number', async () => {
    expect(
      await resolveOrderOwner(
        { phone: PHONE, verificationId: 'check', customerId: 'me' },
        deps({ accountPhone: () => Promise.resolve({ phone: '03451234567', verifiedAt: proven }) }),
      ),
    ).toEqual({ customerId: 'me', phoneVerifiedAt: proven });
  });
});
