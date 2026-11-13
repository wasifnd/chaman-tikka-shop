import { columnPath, formatCompact, labelStep, niceMax } from '../../logic/chart-math';

export interface Datum {
  /** Short text under the column (or beside the bar). */
  label: string;
  value: number;
  /** Full description for the hover tooltip and the table, e.g. "17 Oct: Rs. 12,400, 31 orders". */
  detail: string;
}

const WIDTH = 640;
const HEIGHT = 220;
const LEFT = 44;
const RIGHT = 8;
const TOP = 10;
const BOTTOM = 26;

/**
 * A column chart drawn as plain SVG, so it needs no script and works in the page as sent. One hue,
 * thin columns with rounded tops sitting on the baseline, a quiet grid, and a tooltip on every
 * column. A table of the same numbers sits underneath for anyone who cannot read the picture.
 */
export function ColumnChart({
  data,
  title,
  tableLabel,
  valueHeader,
  labelHeader,
  format,
}: {
  data: Datum[];
  title: string;
  tableLabel: string;
  valueHeader: string;
  labelHeader: string;
  format: (value: number) => string;
}) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = data.length === 0 ? plotWidth : plotWidth / data.length;
  const barWidth = Math.min(28, Math.max(3, slot - 2 > 0 ? slot * 0.62 : slot));
  const step = labelStep(data.length);
  const baseline = TOP + plotHeight;
  const grid = [0, 0.5, 1].map((fraction) => ({
    y: baseline - fraction * plotHeight,
    value: max * fraction,
  }));

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      {/* On a phone the chart keeps a readable size and scrolls sideways rather than shrinking its labels. */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          role="img"
          aria-label={title}
          className="w-full min-w-[560px] text-orange-500"
        >
          {grid.map(({ y, value }) => (
            <g key={y}>
              <line
                x1={LEFT}
                x2={WIDTH - RIGHT}
                y1={y}
                y2={y}
                className="stroke-stone-800"
                strokeWidth={1}
              />
              <text
                x={LEFT - 6}
                y={y + 4}
                textAnchor="end"
                className="fill-stone-500"
                fontSize={11}
              >
                {formatCompact(value)}
              </text>
            </g>
          ))}
          {data.map((d, index) => {
            const height = (d.value / max) * plotHeight;
            const x = LEFT + index * slot + (slot - barWidth) / 2;
            return (
              <g key={`${d.label}-${String(index)}`}>
                {/* A wider, invisible target than the column itself, so thin columns are easy to hover. */}
                <rect
                  x={LEFT + index * slot}
                  y={TOP}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                >
                  <title>{d.detail}</title>
                </rect>
                {height > 0 ? (
                  <path d={columnPath(x, baseline - height, barWidth, height)} fill="currentColor">
                    <title>{d.detail}</title>
                  </path>
                ) : null}
                {index % step === 0 ? (
                  <text
                    x={LEFT + index * slot + slot / 2}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className="fill-stone-400"
                    fontSize={11}
                  >
                    {d.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line
            x1={LEFT}
            x2={WIDTH - RIGHT}
            y1={baseline}
            y2={baseline}
            className="stroke-stone-600"
            strokeWidth={1}
          />
        </svg>
      </div>
      <details className="text-sm text-stone-400">
        <summary className="focus-visible:outline-ember cursor-pointer focus-visible:outline-2">
          {tableLabel}
        </summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-stone-500">
              <th scope="col" className="py-1 pr-4 font-medium">
                {labelHeader}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {valueHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, index) => (
              <tr key={`${d.label}-${String(index)}`} className="border-t border-stone-800">
                <td className="py-1 pr-4">{d.label}</td>
                <td className="py-1 text-right">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/**
 * Ranked horizontal bars (best sellers, order types). Bars are lengths of one hue; the number is
 * always written next to its bar, so nothing depends on reading the length.
 */
export function BarList({
  items,
  format,
}: {
  items: { label: string; value: number; detail?: string }[];
  format: (value: number) => string;
}) {
  const max = Math.max(0, ...items.map((item) => item.value));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.label} className="flex flex-col gap-1" title={item.detail}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 text-stone-300">{format(item.value)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-stone-800" aria-hidden="true">
            <div
              className="bg-ember h-2 rounded-full"
              style={{ width: `${String(max === 0 ? 0 : Math.max(2, (item.value / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
