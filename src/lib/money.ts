/**
 * Money is calculated in "minor units" (paisa, 1/100 rupee) as whole numbers, so sums never
 * pick up floating-point drift (0.1 + 0.2). Convert to rupees only at the edges.
 */

/** Rounds half away from zero, so +1.005 and -1.005 are treated alike. */
function roundHalfAwayFromZero(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded; // avoid returning -0
}

export function toMinor(rupees: number): number {
  // toPrecision(15) strips representation error first: 1.005 * 100 is 100.49999999999999,
  // which would otherwise round down.
  return roundHalfAwayFromZero(Number((rupees * 100).toPrecision(15)));
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

/** `percent` of an amount, rounded to the nearest paisa. */
export function percentOf(minor: number, percent: number): number {
  return roundHalfAwayFromZero(Number(((minor * percent) / 100).toPrecision(15)));
}
