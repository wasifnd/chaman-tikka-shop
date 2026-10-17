import { z } from 'zod';
import {
  imageUrl,
  money,
  optionalMoney,
  optionalText,
  priceChange,
  requiredText,
  sortOrder,
  uuid,
} from './common';

export const categoryInputSchema = z.object({
  nameEn: requiredText('Name', 60),
  descriptionEn: optionalText(300),
  imageUrl,
  sortOrder,
  isActive: z.boolean(),
  isFeatured: z.boolean(),
});
export type CategoryInput = z.output<typeof categoryInputSchema>;
export type CategoryFormValues = z.input<typeof categoryInputSchema>;

export const STOCK_STATUSES = ['IN_STOCK', 'LIMITED', 'OUT_OF_STOCK'] as const;

export const MAX_VARIANT_GROUPS = 5;
export const MAX_VARIANTS_PER_GROUP = 12;

const variantSchema = z.object({
  /** Present when editing an existing option, so carts that already hold it keep working. */
  id: uuid.optional(),
  nameEn: requiredText('Option name', 40),
  priceModifier: priceChange,
  isAvailable: z.boolean(),
});

const variantGroupSchema = z
  .object({
    id: uuid.optional(),
    nameEn: requiredText('Group name', 40),
    isRequired: z.boolean(),
    variants: z.array(variantSchema).max(MAX_VARIANTS_PER_GROUP, 'Too many options'),
  })
  .superRefine((group, ctx) => {
    if (group.isRequired && group.variants.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'A required group needs options',
      });
    }
    const seen = new Set<string>();
    group.variants.forEach((variant, index) => {
      const key = variant.nameEn.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', index, 'nameEn'],
          message: 'Two options share this name',
        });
      }
      seen.add(key);
    });
  });

export const productInputSchema = z
  .object({
    nameEn: requiredText('Name', 80),
    descriptionEn: optionalText(500),
    categoryId: uuid,
    basePrice: money,
    discountPrice: optionalMoney,
    thumbnailUrl: imageUrl,
    preparationTime: z
      .number('Enter minutes')
      .int('Use whole minutes')
      .min(1, 'At least 1 minute')
      .max(240, 'At most 240 minutes'),
    sortOrder,
    isAvailable: z.boolean(),
    isFeatured: z.boolean(),
    isPopular: z.boolean(),
    isActive: z.boolean(),
    stockStatus: z.enum(STOCK_STATUSES),
    variantGroups: z.array(variantGroupSchema).max(MAX_VARIANT_GROUPS, 'Too many option groups'),
    addonIds: z.array(uuid).max(30, 'Too many add-ons'),
  })
  .superRefine((product, ctx) => {
    if (product.discountPrice !== null && product.discountPrice >= product.basePrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountPrice'],
        message: 'The sale price must be lower than the normal price',
      });
    }
    const groups = new Set<string>();
    product.variantGroups.forEach((group, index) => {
      const key = group.nameEn.toLowerCase();
      if (groups.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['variantGroups', index, 'nameEn'],
          message: 'Two groups share this name',
        });
      }
      groups.add(key);
    });
    if (new Set(product.addonIds).size !== product.addonIds.length) {
      ctx.addIssue({ code: 'custom', path: ['addonIds'], message: 'An add-on is listed twice' });
    }
  });
export type ProductInput = z.output<typeof productInputSchema>;
export type ProductFormValues = z.input<typeof productInputSchema>;

export const addonInputSchema = z.object({
  nameEn: requiredText('Name', 40),
  price: money,
  isAvailable: z.boolean(),
});
export type AddonInput = z.output<typeof addonInputSchema>;
export type AddonFormValues = z.input<typeof addonInputSchema>;

export const MAX_DEAL_ITEMS = 20;

const dealMoment = z.iso.datetime({ message: 'Enter a valid date and time' });

export const dealInputSchema = z
  .object({
    nameEn: requiredText('Name', 80),
    descriptionEn: optionalText(500),
    imageUrl,
    price: money,
    startDate: dealMoment.nullish().transform((value) => value ?? null),
    endDate: dealMoment.nullish().transform((value) => value ?? null),
    isAvailable: z.boolean(),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    items: z
      .array(
        z.object({
          productId: uuid,
          variantId: uuid.nullish().transform((value) => value ?? null),
          quantity: z
            .number('Enter a quantity')
            .int('Use a whole number')
            .min(1, 'At least 1')
            .max(50, 'At most 50'),
        }),
      )
      .min(1, 'Add at least one item')
      .max(MAX_DEAL_ITEMS, 'Too many items'),
  })
  .superRefine((deal, ctx) => {
    if (deal.startDate && deal.endDate && deal.endDate <= deal.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'The end must be after the start',
      });
    }
  });
export type DealInput = z.output<typeof dealInputSchema>;
export type DealFormValues = z.input<typeof dealInputSchema>;
