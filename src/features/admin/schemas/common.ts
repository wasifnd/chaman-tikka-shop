import { z } from 'zod';

export const MAX_PRICE = 1_000_000;

const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

/** Rupees with at most two decimals, e.g. 349 or 349.50. */
export const money = z
  .number('Enter an amount')
  .min(0, 'Cannot be negative')
  .max(MAX_PRICE, 'That is too large')
  .refine(hasAtMostTwoDecimals, 'Use at most 2 decimals');

/** A price difference for a variant, which may be negative (a smaller portion can cost less). */
export const priceChange = z
  .number('Enter an amount')
  .min(-MAX_PRICE, 'That is too small')
  .max(MAX_PRICE, 'That is too large')
  .refine(hasAtMostTwoDecimals, 'Use at most 2 decimals');

export const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `Use at most ${String(max)} characters`);

/** Optional text: an untouched form field ("") means "none". */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${String(max)} characters`)
    .nullish()
    .transform((value) => (value ? value : null));

export const sortOrder = z
  .number('Enter a number')
  .int('Use a whole number')
  .min(0, 'Cannot be negative')
  .max(9999, 'Use 9999 or less');

/**
 * Photos are served through next/image, which only loads hosts we have allowed. Anything else
 * would crash the public page that shows it, so only Cloudinary addresses are accepted.
 */
export const IMAGE_HOST = 'res.cloudinary.com';
export const imageUrl = z
  .string()
  .trim()
  .max(500, 'That address is too long')
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => {
    if (value === null) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === IMAGE_HOST;
    } catch {
      return false;
    }
  }, `Use an image address from ${IMAGE_HOST}`);

export const uuid = z.uuid('Invalid id');

/** An empty number box arrives as NaN (or ""), which means "not set" rather than "invalid". */
const blankToNull = (value: unknown): unknown =>
  value === '' || value === undefined || (typeof value === 'number' && Number.isNaN(value))
    ? null
    : value;

/** Optional rupee amount, e.g. a sale price: blank means none. */
export const optionalMoney = z.preprocess(blankToNull, money.nullable());

/** Optional whole number, e.g. a usage limit: blank means none. */
export const optionalInt = (min: number, max: number) =>
  z.preprocess(
    blankToNull,
    z
      .number('Enter a number')
      .int('Use a whole number')
      .min(min, `At least ${String(min)}`)
      .max(max, `At most ${String(max)}`)
      .nullable(),
  );
