import { describe, expect, it } from 'vitest';
import { loginSchema, signupSchema } from './auth.schema';

const valid = { name: 'Ali Khan', phone: '0300-123 4567', password: 'longenough1' };

describe('signupSchema', () => {
  it('needs a phone number and stores it in one form', () => {
    expect(signupSchema.parse(valid).phone).toBe('03001234567');
    expect(signupSchema.parse({ ...valid, phone: '+923001234567' }).phone).toBe('03001234567');
    expect(signupSchema.safeParse({ ...valid, phone: '' }).success).toBe(false);
    expect(signupSchema.safeParse({ name: 'Ali', password: 'longenough1' }).success).toBe(false);
  });

  it('makes email optional, and normalises it when given', () => {
    expect(signupSchema.parse(valid).email).toBeUndefined();
    expect(signupSchema.parse({ ...valid, email: '' }).email).toBeUndefined();
    expect(signupSchema.parse({ ...valid, email: ' ALI@Example.com ' }).email).toBe(
      'ali@example.com',
    );
    expect(signupSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
  });

  it('carries the id of the check that proved the phone', () => {
    const id = '0b8f2a8e-4c1d-4e5f-9a7b-1c2d3e4f5a6b';
    expect(signupSchema.parse({ ...valid, verificationId: id }).verificationId).toBe(id);
    expect(signupSchema.safeParse({ ...valid, verificationId: 'nope' }).success).toBe(false);
  });

  it('rejects bad phone, short name, short and over-long passwords', () => {
    expect(signupSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, name: 'A' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, password: 'x'.repeat(73) }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('signs in by phone number, typed any usual way', () => {
    expect(loginSchema.parse({ phone: '+92 300 1234567', password: 'x' }).phone).toBe(
      '03001234567',
    );
  });

  it('requires a valid phone and a password', () => {
    expect(loginSchema.safeParse({ phone: '03001234567', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: 'a@b.pk', password: 'x' }).success).toBe(false);
  });
});
