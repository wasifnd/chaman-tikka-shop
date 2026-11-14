import { z } from 'zod';
import { paymentReceiptFileName, renderPaymentReceipt } from '@/features/khata/export/khata-export';
import type { IdContext } from '@/features/khata/http';
import { khataRepository, SHOP } from '@/features/khata/server';
import { pdfResponse } from '@/features/orders/receipt/pdf-layout';
import { isStaffRole } from '@/lib/auth/roles';
import { requireSession } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { route } from '@/lib/http/response';

const notFound = () => new AppError('ENTRY_NOT_FOUND', 'That receipt does not exist.', 404);

/**
 * A receipt for one khata payment. Staff can open any; a customer only those on their own khata
 * (and without the staff member's name). Anyone else is told it doesn't exist.
 */
export const GET = route(async (request: Request, { params }: IdContext) => {
  const session = await requireSession();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw notFound();
  const found = await khataRepository.findEntry(id.data);
  if (!found || found.entry.kind === 'ORDER') throw notFound();

  let entry = found.entry;
  if (!isStaffRole(session.role)) {
    const phone = await khataRepository.verifiedPhone(session.userId);
    if (phone !== found.khata.phone) throw notFound();
    entry = { ...entry, by: null };
  }
  const download = new URL(request.url).searchParams.get('download') === '1';
  const pdf = await renderPaymentReceipt(entry, found.khata, SHOP);
  return pdfResponse(pdf, paymentReceiptFileName(entry.id), download);
});
