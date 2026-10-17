const MAX_SLUG_LENGTH = 60;

/** "Chicken Tikka (Half)" -> "chicken-tikka-half". Never empty. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || 'item';
}

/** The first of `base`, `base-2`, `base-3`... that `isTaken` says is free. */
export async function uniqueSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);
  if (!(await isTaken(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${String(n)}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Practically unreachable; a random suffix still keeps the slug unique.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
