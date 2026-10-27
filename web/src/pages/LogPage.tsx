import { useMemo, useState } from 'react';
import { resolveListens } from '../../../shared/stats.ts';
import { formatDate, WEEKDAY_LONG } from '../../../shared/time.ts';
import { useStore } from '../lib/store.tsx';
import { href } from '../lib/router.ts';
import { fmtTime, plural } from '../lib/format.ts';
import { Cover } from '../components/Cover.tsx';
import { Notice } from '../components/bits.tsx';

const SOURCE_LABEL = { nfc: 'NFC tag', shortcut: 'Shortcut', web: 'Web', manual: 'Added later' };

export function LogPage() {
  const { library, send, pending } = useStore();
  const [limit, setLimit] = useState(60);
  const [error, setError] = useState<string>();
  const listens = useMemo(() => resolveListens(library).reverse(), [library]);
  const pendingIds = new Set(pending.filter((p) => p.type === 'spin').map((p) => (p.payload as { id?: string }).id));

  const days: [string, typeof listens][] = [];
  for (const l of listens.slice(0, limit)) {
    const last = days.at(-1);
    if (last && last[0] === l.local.date) last[1].push(l);
    else days.push([l.local.date, [l]]);
  }

  return (
    <div className="page narrow log-page">
      <div className="page-head">
        <span className="kicker">Every needle drop</span>
        <h1>Logbook</h1>
        <p className="muted">
          {plural(listens.length, 'spin')} in total. Spun something without scanning? Log it from the record's page.
        </p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {days.map(([date, items]) => (
        <section key={date} className="log-day">
          <h2>
            {WEEKDAY_LONG[items[0].local.weekday]}, {formatDate(date)}
          </h2>
          <ul className="log-list">
            {items.map((l) => (
              <li key={l.id} className={pendingIds.has(l.id) ? 'is-pending' : ''}>
                <span className="log-time">{fmtTime(l.at)}</span>
                {l.rec ? (
                  <a className="log-record" href={href(`/record/${l.rec.id}`)}>
                    <Cover record={l.rec} size={40} showText={false} className="thumb" />
                    <span>
                      <strong>{l.rec.title}</strong>
                      <span className="muted">{l.rec.artistCredit}</span>
                    </span>
                  </a>
                ) : (
                  <a className="log-record" href={href(`/add?tag=${l.record}`)}>
                    <span className="thumb thumb-empty">?</span>
                    <span>
                      <strong>
                        Unlinked tag <code>{l.record}</code>
                      </strong>
                      <span className="muted">Link it →</span>
                    </span>
                  </a>
                )}
                <span className="log-source">{pendingIds.has(l.id) ? 'pressing…' : SOURCE_LABEL[l.source] ?? l.source}</span>
                <button
                  className="icon-button"
                  aria-label="Delete this spin"
                  onClick={async () => {
                    if (!confirm('Delete this spin?')) return;
                    try {
                      await send('delete-listen', { id: l.id });
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {listens.length > limit && (
        <button className="btn btn-ghost btn-block" onClick={() => setLimit((n) => n + 100)}>
          Older spins
        </button>
      )}
    </div>
  );
}
