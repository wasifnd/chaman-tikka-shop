import { describe, expect, it } from 'vitest';
import { statementResponse } from './http';
import type { KhataDetail } from './types/khata.types';

const khata: KhataDetail = {
  id: 'k1',
  phone: '03331234500',
  name: 'Bilal',
  balance: 490,
  creditLimit: null,
  limit: 10_000,
  updatedAt: '2026-11-14T10:54:00.000Z',
  createdAt: '2026-11-14T10:53:00.000Z',
  entries: [],
};

describe('statement downloads', () => {
  it('a PDF by default, as a private download', async () => {
    const response = await statementResponse(new Request('http://x/statement'), khata);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="khata-03331234500.pdf"',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(
      Buffer.from(await response.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
  });

  it('a spreadsheet with ?format=csv', async () => {
    const response = await statementResponse(new Request('http://x/statement?format=csv'), khata);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="khata-03331234500.csv"',
    );
    expect(await response.text()).toContain('Balance owed');
  });
});
