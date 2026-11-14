import { z } from 'zod';
import { STAFF_ROLES } from '@/lib/auth/roles';
import { requireSession } from '@/lib/auth/session';
import type { SessionUser } from '@/lib/auth/access-token';
import { AppError } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/http/guards';
import { pdfResponse } from '@/features/orders/receipt/pdf-layout';
import { SHOP } from '@/features/orders/receipt/receipt.repository';
import { renderStatementPdf, statementCsv, statementFileName } from './export/khata-export';
import type { KhataDetail } from './types/khata.types';

export type IdContext = { params: Promise<{ id: string }> };

/** Staff screens and their APIs: same-site only (for changes), signed in, and staff or admin. */
export async function requireStaff(request: Request): Promise<SessionUser> {
  if (request.method !== 'GET') assertSameOrigin(request);
  return requireSession(STAFF_ROLES);
}

/** A malformed id is simply "not found". */
export async function khataId(context: IdContext): Promise<string> {
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) throw new AppError('KHATA_NOT_FOUND', 'That khata does not exist.', 404);
  return parsed.data;
}

/** The statement as a PDF (default) or a spreadsheet (?format=csv). */
export async function statementResponse(request: Request, khata: KhataDetail): Promise<Response> {
  const format = new URL(request.url).searchParams.get('format');
  if (format === 'csv') {
    return new Response(statementCsv(khata), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${statementFileName(khata, 'csv')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  const pdf = await renderStatementPdf(khata, SHOP, new Date());
  return pdfResponse(pdf, statementFileName(khata, 'pdf'), true);
}
