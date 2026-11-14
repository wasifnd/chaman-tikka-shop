import { describe, expect, it } from 'vitest';
import {
  CODE_TTL_MS,
  PROOF_TTL_MS,
  createVerificationService,
  phoneNotVerified,
  type VerificationRecord,
  type VerificationRepository,
} from './verification.service';

function createFakeRepo() {
  const rows = new Map<string, VerificationRecord>();
  let seq = 0;
  const open = (row: VerificationRecord, at: Date) => !row.verifiedAt && row.expiresAt > at;
  const repo: VerificationRepository = {
    create: (input) => {
      const row = { id: `v${String(++seq)}`, verifiedAt: null, ...input };
      rows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
    findById: (id) => Promise.resolve(rows.get(id) ?? null),
    markVerified: (phone, code, at) => {
      let found = false;
      for (const row of rows.values()) {
        if (row.phone === phone && row.code === code && open(row, at)) {
          row.verifiedAt = at;
          found = true;
        }
      }
      return Promise.resolve(found);
    },
    markVerifiedById: (id, at) => {
      const row = rows.get(id);
      if (!row || !open(row, at)) return Promise.resolve(false);
      row.verifiedAt = at;
      return Promise.resolve(true);
    },
  };
  return repo;
}

const PHONE = '03001234567';
const start = new Date('2026-11-14T15:00:00Z');

function setup() {
  let current = start;
  let next = 0;
  const service = createVerificationService(
    createFakeRepo(),
    () => current,
    () => String(++next).padStart(6, '0'),
  );
  return {
    service,
    at: (ms: number) => {
      current = new Date(start.getTime() + ms);
    },
  };
}

describe('phone verification', () => {
  it('gives each request a 6-digit code that lasts 10 minutes', async () => {
    const real = createVerificationService(createFakeRepo(), () => start);
    const request = await real.start(PHONE);
    expect(request.code).toMatch(/^\d{6}$/);
    expect(request.expiresAt.getTime() - start.getTime()).toBe(CODE_TTL_MS);
  });

  it('proves the number when the code arrives from that number', async () => {
    const { service } = setup();
    const request = await service.start(PHONE);
    expect(await service.status(request.id)).toBe('pending');
    expect(await service.confirm(PHONE, `Chaman Tikka Shop code: ${request.code}`)).toBe(true);
    expect(await service.status(request.id)).toBe('verified');
    expect(await service.provenAt(request.id, PHONE)).toEqual(start);
  });

  it('ignores the code sent from somebody else’s phone', async () => {
    const { service } = setup();
    const request = await service.start(PHONE);
    expect(await service.confirm('03451234567', request.code)).toBe(false);
    expect(await service.status(request.id)).toBe('pending');
  });

  it('ignores a wrong code or a message with no code', async () => {
    const { service } = setup();
    const request = await service.start(PHONE);
    expect(await service.confirm(PHONE, '999999')).toBe(false);
    expect(await service.confirm(PHONE, 'hello')).toBe(false);
    expect(await service.status(request.id)).toBe('pending');
  });

  it('ignores a code sent after 10 minutes', async () => {
    const { service, at } = setup();
    const request = await service.start(PHONE);
    at(CODE_TTL_MS + 1);
    expect(await service.status(request.id)).toBe('expired');
    expect(await service.confirm(PHONE, request.code)).toBe(false);
  });

  it('accepts the proof for 30 minutes, for that number only', async () => {
    const { service, at } = setup();
    const request = await service.start(PHONE);
    await service.confirm(PHONE, request.code);
    expect(await service.provenAt(request.id, '03451234567')).toBeNull();
    at(PROOF_TTL_MS);
    expect(await service.provenAt(request.id, PHONE)).toEqual(start);
    at(PROOF_TTL_MS + 1);
    expect(await service.provenAt(request.id, PHONE)).toBeNull();
    expect(await service.status(request.id)).toBe('expired');
  });

  it('has no proof without a verified request', async () => {
    const { service } = setup();
    const request = await service.start(PHONE);
    expect(await service.provenAt(undefined, PHONE)).toBeNull();
    expect(await service.provenAt('missing', PHONE)).toBeNull();
    expect(await service.provenAt(request.id, PHONE)).toBeNull();
    expect(await service.status('missing')).toBeNull();
  });

  it('lets the development stand-in prove an open request once', async () => {
    const { service, at } = setup();
    const request = await service.start(PHONE);
    expect(await service.confirmById(request.id)).toBe(true);
    expect(await service.confirmById(request.id)).toBe(false);
    const late = await service.start(PHONE);
    at(CODE_TTL_MS + 1);
    expect(await service.confirmById(late.id)).toBe(false);
  });

  it('names the form field in the error', () => {
    expect(phoneNotVerified('contact.phone')).toMatchObject({
      code: 'PHONE_NOT_VERIFIED',
      status: 403,
      details: { 'contact.phone': 'Verify this number on WhatsApp first' },
    });
  });
});
