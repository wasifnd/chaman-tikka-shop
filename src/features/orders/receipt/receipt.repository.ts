import type { PrismaClient } from '@prisma/client';
import { siteConfig } from '@/lib/site';
import { mapReceipt, type ReceiptData } from './receipt-data';
import { pdfResponse } from './pdf-layout';
import { receiptFileName, renderReceiptPdf, type ReceiptShop } from './receipt-pdf';

const select = {
  orderNumber: true,
  createdAt: true,
  type: true,
  status: true,
  paymentMethod: true,
  paymentStatus: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  deliveryAddressSnapshot: true,
  specialInstructions: true,
  subtotal: true,
  couponDiscount: true,
  deliveryCharge: true,
  taxAmount: true,
  grandTotal: true,
  amountPaid: true,
  customerId: true,
  // A counter order left on a khata belongs to whoever owns that number, too.
  khataEntries: {
    where: { kind: 'ORDER' },
    select: { khata: { select: { phone: true } } },
    take: 1,
  },
  coupon: { select: { code: true } },
  // Same order as the tracking page shows them.
  items: {
    select: {
      productNameSnapshot: true,
      variantSnapshot: true,
      addonSnapshot: true,
      quantity: true,
      unitPrice: true,
      subtotal: true,
      note: true,
      dealId: true,
    },
  },
} as const;

export interface FoundReceipt {
  receipt: ReceiptData;
  /** The account the order belongs to, to decide who sees the full details. */
  customerId: string | null;
  /** The phone number of the khata this order was put on, if any. */
  khataPhone: string | null;
}

/** Looks up an order for its receipt, by tracking link or (for staff) by id. */
export function createReceiptRepository(db: Pick<PrismaClient, 'order'>) {
  return {
    async find(where: { trackingToken: string } | { id: string }): Promise<FoundReceipt | null> {
      const row = await db.order.findUnique({ where, select });
      if (!row) return null;
      return {
        receipt: mapReceipt(row),
        customerId: row.customerId,
        khataPhone: row.khataEntries[0]?.khata.phone ?? null,
      };
    },
  };
}

export const SHOP: ReceiptShop = {
  name: siteConfig.name,
  address: `${siteConfig.address.street}, ${siteConfig.address.city}`,
  hours: 'Open daily, 6 PM to 2 AM',
};

/** The receipt as a PDF reply. Private: it may hold the customer's details. */
export async function receiptResponse(receipt: ReceiptData, download: boolean): Promise<Response> {
  const pdf = await renderReceiptPdf(receipt, SHOP);
  return pdfResponse(pdf, receiptFileName(receipt.orderNumber), download);
}
