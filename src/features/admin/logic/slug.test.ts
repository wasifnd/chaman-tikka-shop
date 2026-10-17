import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it.each([
    ['Chicken Tikka', 'chicken-tikka'],
    ['  Chicken   Tikka (Half) ', 'chicken-tikka-half'],
    ['Café Special', 'cafe-special'],
    ['BBQ & Grill!!', 'bbq-grill'],
    ['---', 'item'],
    ['', 'item'],
    ['چکن', 'item'],
  ])('turns %j into %j', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('keeps slugs short and never ends on a dash', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  const taking =
    (...taken: string[]) =>
    (slug: string) =>
      Promise.resolve(taken.includes(slug));

  it('uses the plain slug when it is free', async () => {
    expect(await uniqueSlug('Naan', taking())).toBe('naan');
  });

  it('adds the first free number when it is taken', async () => {
    expect(await uniqueSlug('Naan', taking('naan'))).toBe('naan-2');
    expect(await uniqueSlug('Naan', taking('naan', 'naan-2', 'naan-3'))).toBe('naan-4');
  });

  it('still returns something unique when every number is taken', async () => {
    const slug = await uniqueSlug('Naan', () => Promise.resolve(true));
    expect(slug).toMatch(/^naan-[a-z0-9]+$/);
  });
});
