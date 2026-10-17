import { Prisma } from '@prisma/client';

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/** A unique index rejected the write (e.g. two admins picked the same slug at once). */
export const isUniqueViolation = (error: unknown): boolean => hasCode(error, 'P2002');

/** A foreign key rejected the write (something still points at the row). */
export const isForeignKeyViolation = (error: unknown): boolean => hasCode(error, 'P2003');

/** The row to update or delete no longer exists. */
export const isNotFound = (error: unknown): boolean => hasCode(error, 'P2025');
