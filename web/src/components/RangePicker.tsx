import { useState } from 'react';
import { navigate } from '../lib/router.ts';
import { presets, type ResolvedRange } from '../lib/ranges.ts';

/** Date-range presets styled as tape-deck piano keys; custom range tucked behind the last key. */
export function RangePicker({ current, today, basePath }: { current: ResolvedRange; today: string; basePath: string }) {
  const [custom, setCustom] = useState(current.id === 'custom');
  const [from, setFrom] = useState(current.range.from);
  const [to, setTo] = useState(current.range.to);

  const go = (q: Record<string, string>) => navigate(`${basePath}?${new URLSearchParams(q)}`);

  return (
    <div className="range-picker">
      <div className="tape-keys" role="radiogroup" aria-label="Time range">
        {presets(today).map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={current.id === p.id}
            className="tape-key"
            onClick={() => {
              setCustom(false);
              go({ range: p.id });
            }}
          >
            {p.label}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={current.id === 'custom'} className="tape-key" onClick={() => setCustom((v) => !v)}>
          Custom
        </button>
      </div>
      {custom && (
        <form
          className="custom-range"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) go({ range: 'custom', from, to });
          }}
        >
          <label>
            From <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label>
            To <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <button className="btn btn-small" type="submit">
            Play range
          </button>
        </form>
      )}
    </div>
  );
}
