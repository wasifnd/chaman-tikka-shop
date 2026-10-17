import { describe, expect, it } from 'vitest';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';

describe('refresh tokens', () => {
  it('generates unique tokens whose hash matches', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(hashRefreshToken(a.token)).toBe(a.hash);
    expect(a.hash).not.toBe(a.token);
  });
});
