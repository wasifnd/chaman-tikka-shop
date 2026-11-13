import type { DayPoint, ProductPoint } from './analytics';
import { isoToKarachiLocal } from './karachi-time';

export type CsvValue = string | number | boolean | null | undefined;

/**
 * One cell, ready for a spreadsheet. Text that starts with = + - @ (or a tab or return) would be
 * run as a formula by Excel or Sheets, which a customer's name could abuse, so it is prefixed with
 * an apostrophe. Numbers are left alone so negative amounts stay numbers. Anything containing a
 * comma, quote or line break is quoted, with quotes doubled.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = typeof value === 'boolean' ? (value ? 'yes' : 'no') : value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A BOM first so Excel reads accents and Urdu correctly; CRLF line ends as the CSV standard says. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export interface ExportOrder {
  orderNumber: string;
  createdAt: string;
  type: string;
  status: string;
  customerName: string;
  phone: string;
  registered: boolean;
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  couponCode: string | null;
}

export const ORDER_HEADERS = [
  'Order number',
  'Placed (Karachi time)',
  'Type',
  'Status',
  'Customer',
  'Phone',
  'Signed-in customer',
  'Subtotal',
  'Coupon discount',
  'Delivery charge',
  'Tax',
  'Total',
  'Payment method',
  'Payment status',
  'Coupon',
];

export function ordersCsv(orders: ExportOrder[]): string {
  return toCsv(
    ORDER_HEADERS,
    orders.map((order) => [
      order.orderNumber,
      isoToKarachiLocal(order.createdAt).replace('T', ' '),
      order.type,
      order.status,
      order.customerName,
      order.phone,
      order.registered,
      order.subtotal,
      order.couponDiscount,
      order.deliveryCharge,
      order.taxAmount,
      order.grandTotal,
      order.paymentMethod,
      order.paymentStatus,
      order.couponCode,
    ]),
  );
}

export const productsCsv = (products: ProductPoint[]): string =>
  toCsv(
    ['Item', 'Quantity sold', 'Sales'],
    products.map((product) => [product.name, product.quantity, product.revenue]),
  );

export const dailyCsv = (days: DayPoint[]): string =>
  toCsv(
    ['Business day', 'Orders', 'Sales'],
    days.map((day) => [day.day, day.orders, day.revenue]),
  );

export const EXPORT_KINDS = ['orders', 'products', 'daily'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
