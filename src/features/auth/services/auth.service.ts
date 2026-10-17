import { signAccessToken, type SessionUser } from '@/lib/auth/access-token';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { generateRefreshToken, hashRefreshToken } from '@/lib/auth/refresh-token';
import type { Role } from '@/lib/auth/roles';
import { AppError } from '@/lib/errors';
import type { LoginInput, SignupInput } from '../schemas/auth.schema';

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  customerId: string | null;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Persistence port. The Prisma implementation lives in auth.repository.ts. */
export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  createCustomerUser(input: {
    email: string;
    passwordHash: string;
    name: string;
    phone?: string;
  }): Promise<AuthUserRecord>;
  touchLastLogin(userId: string): Promise<void>;
  saveRefreshToken(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Atomically revokes a token. Returns false if it was already revoked. */
  revokeRefreshToken(id: string): Promise<boolean>;
  revokeAllRefreshTokens(userId: string): Promise<void>;
}

export interface AuthConfig {
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  bcryptCost?: number;
}

export interface AuthSession {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

const invalidCredentials = () =>
  new AppError('INVALID_CREDENTIALS', 'Incorrect email or password.', 401);
const invalidRefresh = () =>
  new AppError('INVALID_REFRESH_TOKEN', 'Your session has expired. Please sign in again.', 401);

export function createAuthService(
  repo: AuthRepository,
  config: AuthConfig,
  now: () => Date = () => new Date(),
) {
  // Compared against when the email is unknown so response time doesn't reveal which emails exist.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = () => (dummyHash ??= hashPassword('not-a-real-password', config.bcryptCost));

  function toSessionUser(record: AuthUserRecord): SessionUser {
    return {
      userId: record.id,
      email: record.email,
      role: record.role,
      ...(record.customerId ? { customerId: record.customerId } : {}),
    };
  }

  async function issueSession(record: AuthUserRecord): Promise<AuthSession> {
    const user = toSessionUser(record);
    const refresh = generateRefreshToken();
    const expiresAt = new Date(now().getTime() + config.refreshTtlDays * 86_400_000);
    await repo.saveRefreshToken({ userId: record.id, tokenHash: refresh.hash, expiresAt });
    const accessToken = await signAccessToken(user, config.accessSecret, config.accessTtlSeconds);
    return { user, accessToken, refreshToken: refresh.token };
  }

  return {
    async signup(input: SignupInput): Promise<AuthSession> {
      if (await repo.findUserByEmail(input.email)) {
        throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
      }
      const passwordHash = await hashPassword(input.password, config.bcryptCost);
      const record = await repo.createCustomerUser({
        email: input.email,
        passwordHash,
        name: input.name,
        ...(input.phone ? { phone: input.phone } : {}),
      });
      return issueSession(record);
    },

    async login(input: LoginInput): Promise<AuthSession> {
      const record = await repo.findUserByEmail(input.email);
      const passwordOk = await verifyPassword(
        input.password,
        record?.passwordHash ?? (await getDummyHash()),
      );
      if (!record || !passwordOk) throw invalidCredentials();
      // Only reveal a disabled account to someone who proved they know the password.
      if (!record.isActive) {
        throw new AppError('ACCOUNT_DISABLED', 'This account has been disabled.', 403);
      }
      await repo.touchLastLogin(record.id);
      return issueSession(record);
    },

    /** Rotates the refresh token. Presenting an already-used token revokes the whole family. */
    async refresh(token: string): Promise<AuthSession> {
      const stored = await repo.findRefreshToken(hashRefreshToken(token));
      if (!stored) throw invalidRefresh();

      if (stored.revokedAt) {
        await repo.revokeAllRefreshTokens(stored.userId);
        throw invalidRefresh();
      }
      if (stored.expiresAt <= now()) throw invalidRefresh();

      if (!(await repo.revokeRefreshToken(stored.id))) {
        // Lost a race with another request using the same token: treat as replay.
        await repo.revokeAllRefreshTokens(stored.userId);
        throw invalidRefresh();
      }

      const record = await repo.findUserById(stored.userId);
      if (!record?.isActive) throw invalidRefresh();
      return issueSession(record);
    },

    async logout(token: string | undefined): Promise<void> {
      if (!token) return;
      const stored = await repo.findRefreshToken(hashRefreshToken(token));
      if (stored && !stored.revokedAt) await repo.revokeRefreshToken(stored.id);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
