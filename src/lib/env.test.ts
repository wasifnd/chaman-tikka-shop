import { afterEach, describe, expect, it, vi } from 'vitest';
import { env, parseEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://x',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('env()', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads process.env once and caches the result', () => {
    for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value);
    const first = env();
    vi.stubEnv('DATABASE_URL', 'postgresql://changed');
    expect(env()).toBe(first);
    expect(first.DATABASE_URL).toBe('postgresql://x');
  });
});

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.ACCESS_TOKEN_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000');
  });

  it('coerces numeric values', () => {
    expect(parseEnv({ ...valid, REFRESH_TOKEN_TTL_DAYS: '30' }).REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it('lists every invalid variable in one error', () => {
    expect(() => parseEnv({ JWT_ACCESS_SECRET: 'short' })).toThrow(
      /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET/,
    );
  });
});
