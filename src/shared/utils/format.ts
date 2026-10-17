const rupees = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

/** 1080 -> "Rs. 1,080". Prices are whole rupees on the menu. */
export function formatPrice(amount: number): string {
  return `Rs. ${rupees.format(amount)}`;
}

/** Whole-number percentage saved, or 0 when there is no saving. */
export function percentOff(original: number, price: number): number {
  if (original <= 0 || price >= original) return 0;
  return Math.round(((original - price) / original) * 100);
}
