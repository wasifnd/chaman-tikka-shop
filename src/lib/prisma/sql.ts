import { Prisma } from '@prisma/client';

const SAFE_SCHEMA = /^[a-z0-9_]+$/i;

/**
 * Table names for raw SQL, qualified with the schema so they work through connection poolers
 * (which don't keep a per-session search_path). The name is checked so it can never carry SQL.
 */
export function qualifier(schema: string) {
  if (!SAFE_SCHEMA.test(schema)) throw new Error(`Invalid schema name: ${schema}`);
  return (table: string) => Prisma.raw(`"${schema}"."${table}"`);
}
