import { z } from 'zod';

export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 50;

const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY);

const productLine = z.object({
  kind: z.literal('product'),
  productId: z.uuid(),
  quantity,
  variantIds: z.array(z.uuid()).max(20).default([]),
  addonIds: z.array(z.uuid()).max(20).default([]),
  note: z.string().trim().max(200).optional(),
});

const dealLine = z.object({
  kind: z.literal('deal'),
  dealId: z.uuid(),
  quantity,
});

export const cartLineSchema = z.discriminatedUnion('kind', [productLine, dealLine]);

export const quoteRequestSchema = z.object({
  lines: z.array(cartLineSchema).max(MAX_CART_LINES),
  orderType: z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']),
  zoneId: z.uuid().nullish(),
  couponCode: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((code) => (code ? code : null)),
});

export type QuoteRequest = z.output<typeof quoteRequestSchema>;
