import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse', 4);
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same', 4)).not.toBe(await hashPassword('same', 4));
  });
});
