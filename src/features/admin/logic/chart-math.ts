/** The top of an axis: the next "round" number (1, 2, 5 times a power of ten) above the data. */
export function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/** Show every n-th label so a long axis stays readable (about `target` labels in all). */
export function labelStep(count: number, target = 8): number {
  return Math.max(1, Math.ceil(count / target));
}

/** 1250 -> "1.3k", 2500000 -> "2.5M": short enough for an axis. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (abs >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (abs >= 1000) return `${trim(value / 1000)}k`;
  return String(Math.round(value * 100) / 100);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-07" -> "7 Oct". */
export function formatDay(key: string): string {
  const [, month, day] = key.split('-').map(Number) as [number, number, number];
  return `${String(day)} ${MONTHS[month - 1] ?? ''}`;
}

/** 0-23 -> "12 AM", "6 PM". */
export function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(twelve)} ${suffix}`;
}

/**
 * A column with rounded top corners and a square bottom, so it sits flat on the baseline.
 * `radius` is clamped so a short bar never gets a distorted shape.
 */
export function columnPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4,
): string {
  if (height <= 0 || width <= 0) return '';
  const r = Math.min(radius, width / 2, height);
  const bottom = y + height;
  const f = (n: number) => String(Math.round(n * 100) / 100);
  return [
    `M${f(x)} ${f(bottom)}`,
    `V${f(y + r)}`,
    `Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}`,
    `H${f(x + width - r)}`,
    `Q${f(x + width)} ${f(y)} ${f(x + width)} ${f(y + r)}`,
    `V${f(bottom)}`,
    'Z',
  ].join('');
}

export type Change =
  | { kind: 'none' }
  | { kind: 'flat' }
  | { kind: 'up'; percent: number }
  | { kind: 'down'; percent: number };

/** A comparison with the previous period, as words and a whole percentage. */
export function describeChange(fraction: number | null): Change {
  if (fraction === null) return { kind: 'none' };
  const percent = Math.round(Math.abs(fraction) * 100);
  if (percent === 0) return { kind: 'flat' };
  return fraction > 0 ? { kind: 'up', percent } : { kind: 'down', percent };
}
