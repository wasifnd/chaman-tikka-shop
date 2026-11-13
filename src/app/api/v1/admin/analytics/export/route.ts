import { z } from 'zod';
import { requireAdmin } from '@/features/admin/http';
import { resolveRange } from '@/features/admin/logic/analytics-range';
import { dailyCsv, EXPORT_KINDS, ordersCsv, productsCsv } from '@/features/admin/logic/csv';
import { analytics } from '@/features/admin/server';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/http/response';

const querySchema = z.object({
  kind: z.enum(EXPORT_KINDS),
  preset: z.string().max(10).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
});

/** A spreadsheet of orders, items sold, or daily sales for the chosen dates. Admins only. */
export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    throw new AppError('INVALID_EXPORT', 'Choose what to export: orders, products or daily.', 422);
  }
  const { kind, ...choice } = parsed.data;
  const range = resolveRange(choice, new Date());

  const body =
    kind === 'orders'
      ? ordersCsv(await analytics.exportOrders(range))
      : kind === 'products'
        ? productsCsv(await analytics.allProducts(range))
        : dailyCsv(await analytics.dailySeries(range));

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bbq-${kind}-${range.from}_to_${range.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
