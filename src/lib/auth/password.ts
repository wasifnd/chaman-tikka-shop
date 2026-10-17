import bcrypt from 'bcryptjs';

export const DEFAULT_BCRYPT_COST = 12;

export function hashPassword(password: string, cost = DEFAULT_BCRYPT_COST): Promise<string> {
  return bcrypt.hash(password, cost);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
