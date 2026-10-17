import { z } from 'zod';
import { ADMIN_ROLES } from '@/lib/auth/roles';
import { requireSession } from '@/lib/auth/session';
import type { SessionUser } from '@/lib/auth/access-token';
import { AppError } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/http/guards';

/** Every admin endpoint: same-site only (for changes), signed in, and an admin. */
export async function requireAdmin(request: Request): Promise<SessionUser> {
  if (request.method !== 'GET') assertSameOrigin(request);
  return requireSession(ADMIN_ROLES);
}

/** A malformed id is simply "not found": there is nothing useful to tell the caller. */
export function parseId(value: string, code: string, message: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new AppError(code, message, 404);
  return parsed.data;
}

export type IdContext = { params: Promise<{ id: string }> };
