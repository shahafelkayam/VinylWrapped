import { useMemo, useState } from 'react';
import type { VinylRecord } from '../../../shared/types.ts';
import { GENRE_FAMILIES, recordFamily } from '../../../shared/genres.ts';
import { useStore } from '../lib/store.tsx';
import { href } from '../lib/router.ts';
import { fmtAgo, plural } from '../lib/format.ts';
import { Notice, Sleeve } from '../components/bits.tsx';

type Sort = 'played' | 'recent' | 'added' | 'title' | 'year' | 'dusty';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'played', label: 'Most played' },
  { id: 'recent', label: 'Recently played' },
  { id: 'added', label: 'Recently added' },
  { id: 'dusty', label: 'Dustiest first' },
  { id: 'title', label: 'A → Z' },
  { id: 'year', label: 'Release year' },
];

export function CratePage() {
  const { library } = useStore();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('played');
  const [family, setFamily] = useState('');

  const { counts, last, unlinked } = useMemo(() => {
    const counts = new Map<string, number>();
    const last = new Map<string, string>();
    const unlinked = new Map<string, number>();
    for (const l of library.listens) {
      if (!library.records[l.record]) {
        unlinked.set(l.record, (unlinked.get(l.record) ?? 0) + 1);
        continue;
      }
      counts.set(l.record, (counts.get(l.record) ?? 0) + 1);
      const d = l.at.slice(0, 10);
      if (d > (last.get(l.record) ?? '')) last.set(l.record, d);
    }
    return { counts, last, unlinked };
  }, [library]);

  const records = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (r: VinylRecord) =>
      !needle || [r.title, r.artistCredit, r.label ?? '', ...r.genres, String(r.year ?? '')].some((s) => s.toLowerCase().includes(needle));
    const list = Object.values(library.records).filter((r) => match(r) && (!family || recordFamily(r.genres) === family));
    const by: Record<Sort, (a: VinylRecord, b: VinylRecord) => number> = {
      played: (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.title.localeCompare(b.title),
      recent: (a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? ''),
      added: (a, b) => b.addedAt.localeCompare(a.addedAt),
      dusty: (a, b) => (last.get(a.id) ?? '').localeCompare(last.get(b.id) ?? ''),
      title: (a, b) => a.title.localeCompare(b.title),
      year: (a, b) => (a.year ?? 9999) - (b.year ?? 9999),
    };
    return list.sort(by[sort]);
  }, [library, q, sort, family, counts, last]);

  const families = useMemo(() => {
    const present = new Set(Object.values(library.records).map((r) => recordFamily(r.genres)));
    return GENRE_FAMILIES.filter((f) => present.has(f));
  }, [library]);

  const total = Object.keys(library.records).length;

  return (
    <div className="page crate-page">
      <div className="page-head row">
        <div>
          <span className="kicker">The collection</span>
          <h1>Your crate</h1>
          <p className="muted">{plural(total, 'record')}</p>
        </div>
        <a className="btn" href={href('/add')}>
          + Add a record
        </a>
      </div>

      {unlinked.size > 0 && (
        <Notice tone="warn">
          Scanned tags waiting for a record:{' '}
          {[...unlinked].map(([id, n], i) => (
            <span key={id}>
              {i > 0 && ', '}
              <a href={href(`/add?tag=${id}`)}>
                <code>{id}</code>
              </a>{' '}
              ({plural(n, 'spin')})
            </span>
          ))}
        </Notice>
      )}

      <div className="toolbar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title, artist, genre, label…" aria-label="Filter records" />
        <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Genre family">
          <option value="">All genres</option>
          {families.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {records.length === 0 ? (
        <p className="muted empty-chart">{total ? 'Nothing matches that filter.' : 'Your crate is empty. Add your first record!'}</p>
      ) : (
        <div className="crate-grid">
          {records.map((r) => (
            <Sleeve
              key={r.id}
              record={r}
              badge={counts.get(r.id) ?? 0}
              caption={last.get(r.id) ? `last spun ${fmtAgo(last.get(r.id)!)}` : 'not spun yet'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
