import { describe, expect, it } from 'vitest';
import { siteUrl } from './site';

describe('siteUrl', () => {
  it('falls back to localhost when unset or blank', () => {
    expect(siteUrl({})).toBe('http://localhost:3000');
    expect(siteUrl({ NEXT_PUBLIC_APP_URL: '' })).toBe('http://localhost:3000');
  });

  it('strips trailing slashes so paths can be appended safely', () => {
    expect(siteUrl({ NEXT_PUBLIC_APP_URL: 'https://bbqstore.pk///' })).toBe('https://bbqstore.pk');
  });
});
