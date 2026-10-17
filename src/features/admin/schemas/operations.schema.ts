import { z } from 'zod';
import { ORDER_STATUSES, ORDER_TYPES } from '@/features/orders/state-machine';
import { money, optionalInt, optionalMoney, optionalText, requiredText, sortOrder } from './common';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));

/** Same rule as signup: bcrypt only reads the first 72 bytes. */
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine((value) => new TextEncoder().encode(value).length <= 72, 'Password is too long');

export const restaurantSettingsSchema = z.object({
  name: requiredText('Name', 60),
  address: optionalText(200),
  taxRatePercent: z
    .number('Enter a percentage')
    .min(0, 'Cannot be negative')
    .max(30, 'At most 30%')
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
      'Use at most 2 decimals',
    ),
  orderingEnabled: z.boolean(),
});
export type RestaurantSettingsInput = z.output<typeof restaurantSettingsSchema>;
export type RestaurantSettingsFormValues = z.input<typeof restaurantSettingsSchema>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 18:00');

export const hoursSchema = z
  .array(
    z
      .object({
        dayOfWeek: z.number().int().min(0).max(6),
        isClosed: z.boolean(),
        openTime: z.string().nullish(),
        closeTime: z.string().nullish(),
      })
      .superRefine((day, ctx) => {
        if (day.isClosed) return;
        for (const field of ['openTime', 'closeTime'] as const) {
          if (!time.safeParse(day[field]).success) {
            ctx.addIssue({ code: 'custom', path: [field], message: 'Use a time like 18:00' });
          }
        }
        if (day.openTime && day.openTime === day.closeTime) {
          ctx.addIssue({
            code: 'custom',
            path: ['closeTime'],
            message: 'Closing time must differ from opening time',
          });
        }
      }),
  )
  .length(7, 'Provide all seven days')
  .refine(
    (days) => new Set(days.map((day) => day.dayOfWeek)).size === 7,
    'Each day must appear exactly once',
  );
export type HoursInput = z.output<typeof hoursSchema>;

export const settingsUpdateSchema = z.object({
  restaurant: restaurantSettingsSchema,
  hours: hoursSchema,
});
export type SettingsUpdate = z.output<typeof settingsUpdateSchema>;
export type SettingsFormValues = z.input<typeof settingsUpdateSchema>;

export const zoneInputSchema = z.object({
  name: requiredText('Area name', 60),
  charge: money,
  freeDeliveryAbove: optionalMoney,
  minOrderAmount: money,
  isActive: z.boolean(),
  sortOrder,
});
export type ZoneInput = z.output<typeof zoneInputSchema>;
export type ZoneFormValues = z.input<typeof zoneInputSchema>;

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,24}$/, 'Use 3-24 letters, numbers, - or _'),
    type: z.enum(['FIXED', 'PERCENTAGE']),
    amount: money.refine((value) => value > 0, 'Must be more than zero'),
    minimumOrderAmount: money,
    usageLimit: optionalInt(1, 1_000_000),
    expiresAt: z.iso
      .datetime({ message: 'Enter a valid date and time' })
      .nullish()
      .transform((value) => value ?? null),
    isActive: z.boolean(),
  })
  .superRefine((coupon, ctx) => {
    if (coupon.type === 'PERCENTAGE' && coupon.amount > 100) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'A percentage cannot exceed 100' });
    }
  });
export type CouponInput = z.output<typeof couponInputSchema>;
export type CouponFormValues = z.input<typeof couponInputSchema>;

export const TEAM_ROLES = ['STORE_STAFF', 'ADMIN'] as const;

export const teamCreateSchema = z.object({
  email,
  role: z.enum(TEAM_ROLES),
  password,
});
export type TeamCreateInput = z.output<typeof teamCreateSchema>;
export type TeamCreateFormValues = z.input<typeof teamCreateSchema>;

export const teamUpdateSchema = z
  .object({
    role: z.enum(TEAM_ROLES).optional(),
    isActive: z.boolean().optional(),
    password: password.optional(),
  })
  .refine(
    (value) =>
      value.role !== undefined || value.isActive !== undefined || value.password !== undefined,
    'Nothing to change',
  );
export type TeamUpdateInput = z.output<typeof teamUpdateSchema>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const ordersQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => (value ? value : undefined)),
  status: z.enum(ORDER_STATUSES).optional(),
  type: z.enum(ORDER_TYPES).optional(),
  from: day.optional(),
  to: day.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type OrdersQuery = z.output<typeof ordersQuerySchema>;
