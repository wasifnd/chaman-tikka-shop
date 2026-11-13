import { jwtVerify, SignJWT } from 'jose';
import { isRole, type Role } from './roles';

export interface SessionUser {
  userId: string;
  role: Role;
  /** The sign-in number. Missing only on accounts made before phone sign-in. */
  phone?: string;
  email?: string;
  customerId?: string;
}

const encode = (secret: string) => new TextEncoder().encode(secret);

export async function signAccessToken(
  user: SessionUser,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({
    role: user.role,
    ...(user.phone ? { phone: user.phone } : {}),
    ...(user.email ? { email: user.email } : {}),
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
    const { sub, phone, email, role, customerId } = payload;
    if (!sub || !isRole(role)) return null;
    return {
      userId: sub,
      role,
      ...(typeof phone === 'string' ? { phone } : {}),
      ...(typeof email === 'string' ? { email } : {}),
      ...(typeof customerId === 'string' ? { customerId } : {}),
    };
  } catch {
    return null;
  }
}
