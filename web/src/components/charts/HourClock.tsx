import { formatHour } from '../../../../shared/time.ts';
import { fmtNumber } from '../../lib/format.ts';
import { EmptyChart, useTooltip, VIZ } from './common.tsx';

const C = 150;
const R0 = 64;
const LEN = 74;

function sector(hour: number, r1: number, r2: number, fill = 0.64): string {
  const span = (2 * Math.PI) / 24;
  const mid = hour * span - Math.PI / 2;
  const a0 = mid - (span * fill) / 2;
  const a1 = mid + (span * fill) / 2;
  const p = (r: number, a: number) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
  return `M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r2, a1)} A${r2},${r2} 0 0 0 ${p(r2, a0)} Z`;
}

/**
 * Spins by hour of day as radial bars around a record. Radial is earned here: time of day is cyclic,
 * and 11pm sits next to midnight.
 */
export function HourClock({ hours }: { hours: number[] }) {
  const tip = useTooltip();
  const total = hours.reduce((a, b) => a + b, 0);
  if (!total) return <EmptyChart />;
  const max = Math.max(...hours);
  const peak = hours.indexOf(max);

  return (
    <div className="hour-clock tip-layer" ref={tip.ref}>
      <svg viewBox="-24 -24 348 348" role="img" aria-label={`Spins by hour of day; busiest hour ${formatHour(peak)}`}>
        <circle cx={C} cy={C} r={R0 + LEN} fill="none" stroke={VIZ.grid} />
        <circle cx={C} cy={C} r={R0 + LEN / 2} fill="none" stroke={VIZ.grid} />
        <circle cx={C} cy={C} r={R0 - 4} fill="#16130f" />
        {Array.from({ length: 9 }, (_, i) => (
          <circle key={i} cx={C} cy={C} r={R0 - 10 - i * 2.4} fill="none" stroke="#fff" strokeOpacity="0.06" />
        ))}
        <circle cx={C} cy={C} r={22} fill={VIZ.series} />
        <circle cx={C} cy={C} r={2.4} fill="#fbf5e8" />
        {hours.map((v, h) =>
          v > 0 ? <path key={h} d={sector(h, R0, R0 + Math.max(3, (v / max) * LEN))} fill={VIZ.series} opacity={tip.active?.label === formatHour(h) ? 0.7 : 1} /> : null,
        )}
        {[0, 6, 12, 18].map((h) => {
          const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
          const r = R0 + LEN + 14;
          return (
            <text key={h} x={C + r * Math.cos(a)} y={C + r * Math.sin(a)} dy="0.32em" textAnchor="middle" className="axis-text">
              {formatHour(h)}
            </text>
          );
        })}
        {hours.map((v, h) => (
          <path
            key={`hit-${h}`}
            d={sector(h, R0 - 2, R0 + LEN + 4, 1)}
            fill="transparent"
            className="hit"
            {...tip.bind({ value: `${fmtNumber(v)} spins`, label: formatHour(h), extra: `${Math.round((v / total) * 100)}% of spins` })}
          />
        ))}
      </svg>
      <div className="hour-clock-peak" aria-hidden="true">
        <span>peak</span>
        <strong>{formatHour(peak)}</strong>
      </div>
      {tip.node}
    </div>
  );
}
