import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma/client';
import type { CookieConfig } from '@/lib/auth/cookies';
import { createPrismaAuthRepository } from './services/auth.repository';
import { createAuthService, type AuthService } from './services/auth.service';

let service: AuthService | undefined;

/** Lazily wires the auth service to Prisma and validated env (server-only). */
export function getAuthService(): AuthService {
  const e = env();
  service ??= createAuthService(createPrismaAuthRepository(prisma), {
    accessSecret: e.JWT_ACCESS_SECRET,
    accessTtlSeconds: e.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
  });
  return service;
}

export function getCookieConfig(): CookieConfig {
  const e = env();
  return {
    accessTtlSeconds: e.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
    secure: process.env.NODE_ENV === 'production',
  };
}
