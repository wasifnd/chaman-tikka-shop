import { jwtVerify, SignJWT } from 'jose';
import { isRole, type Role } from './roles';

export interface SessionUser {
  userId: string;
  email: string;
  role: Role;
  customerId?: string;
}

const encode = (secret: string) => new TextEncoder().encode(secret);

export async function signAccessToken(
  user: SessionUser,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({
    email: user.email,
    role: user.role,
    ...(user.customerId ? { customerId: user.customerId } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${String(ttlSeconds)}s`)
    .sign(encode(secret));
}

/** Returns the session, or null for any invalid, tampered or expired token. */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, encode(secret), { algorithms: ['HS256'] });
    const { sub, email, role, customerId } = payload;
    if (!sub || typeof email !== 'string' || !isRole(role)) return null;
    return { userId: sub, email, role, ...(typeof customerId === 'string' ? { customerId } : {}) };
  } catch {
    return null;
  }
}
