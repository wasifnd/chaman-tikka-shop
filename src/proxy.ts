import { NextResponse, type NextRequest } from 'next/server';
import { decideAccess } from '@/lib/auth/access-control';
import { verifyAccessToken } from '@/lib/auth/access-token';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

/**
 * Optimistic route protection (cookie check only, no database). Route handlers and
 * server components still authorize for real via requireSession().
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const secret = process.env['JWT_ACCESS_SECRET'] ?? '';
  const session = token && secret ? await verifyAccessToken(token, secret) : null;

  const decision = decideAccess(pathname, session);
  if (decision.action === 'allow') return NextResponse.next();
  if (decision.action === 'forbidden') return NextResponse.redirect(new URL('/', request.url));

  const refresh = new URL('/api/auth/refresh', request.url);
  refresh.searchParams.set('next', pathname + search);
  return NextResponse.redirect(refresh);
}

export const config = { matcher: ['/admin/:path*', '/store/:path*', '/account/:path*'] };
