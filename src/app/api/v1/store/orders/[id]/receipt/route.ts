import { z } from 'zod';
import { receiptResponse } from '@/features/orders/receipt/receipt.repository';
import { getReceiptRepository } from '@/features/orders/server';
import { STAFF_ROLES } from '@/lib/auth/roles';
import { requireSession } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/http/response';

type Context = { params: Promise<{ id: string }> };

/** The full receipt for staff and admins, to print for the bag or the counter. */
export const GET = route(async (request: Request, { params }: Context) => {
  await requireSession(STAFF_ROLES);
  const id = z.uuid().safeParse((await params).id);
  const found = id.success ? await getReceiptRepository().find({ id: id.data }) : null;
  if (!found) throw new AppError('ORDER_NOT_FOUND', 'That order does not exist.', 404);
  const download = new URL(request.url).searchParams.get('download') === '1';
  return receiptResponse(found.receipt, download);
});
