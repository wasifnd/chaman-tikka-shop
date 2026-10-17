import { describe, expect, it } from 'vitest';
import { loginSchema, signupSchema } from './auth.schema';

const valid = { name: 'Ali Khan', email: 'ALI@Example.com ', password: 'longenough1' };

describe('signupSchema', () => {
  it('normalises email and accepts a valid payload', () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed.email).toBe('ali@example.com');
    expect(parsed.phone).toBeUndefined();
  });

  it('normalises phone numbers', () => {
    expect(signupSchema.parse({ ...valid, phone: '0300-123 4567' }).phone).toBe('03001234567');
    expect(signupSchema.parse({ ...valid, phone: '+923001234567' }).phone).toBe('+923001234567');
  });

  it('treats an empty phone field as not provided', () => {
    expect(signupSchema.parse({ ...valid, phone: '' }).phone).toBeUndefined();
  });

  it('rejects bad phone, short name, short and over-long passwords', () => {
    expect(signupSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, name: 'A' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, password: 'x'.repeat(73) }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(signupSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('requires a password and lowercases the email', () => {
    expect(loginSchema.parse({ email: 'A@B.pk', password: 'x' }).email).toBe('a@b.pk');
    expect(loginSchema.safeParse({ email: 'a@b.pk', password: '' }).success).toBe(false);
  });
});
