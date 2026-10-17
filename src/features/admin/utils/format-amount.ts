/** Whole rupees show without decimals; anything with paisa shows two. */
export function formatAmount(amount: number): string {
  const fixed = Number.isInteger(amount) ? amount.toLocaleString('en-PK') : amount.toFixed(2);
  return `Rs. ${fixed}`;
}
