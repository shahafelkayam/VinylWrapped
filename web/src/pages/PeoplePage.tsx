// The listeners you're allowed to see (the database decides: public, members-only, or just you).
import { useEffect, useMemo, useState } from 'react';
import { directory, type DirectoryEntry, type Visibility } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';
import { href } from '../lib/router.ts';
import { fmtAgo, fmtNumber, plural } from '../lib/format.ts';
import { Notice, Spinner } from '../components/bits.tsx';

export const VISIBILITY_LABEL: Record<Visibility, { icon: string; label: string; detail: string }> = {
  public: { icon: '🌍', label: 'Public', detail: 'Anyone with the link, even without an account' },
  members: { icon: '🎟️', label: 'Members', detail: 'Anyone signed in to VinylWrapped' },
  private: { icon: '🔒', label: 'Private', detail: 'Only you' },
};

export function PeoplePage() {
  const { mode, me } = useStore();
  const [people, setPeople] = useState<DirectoryEntry[]>();
  const [error, setError] = useState<string>();
  const [q, setQ] = useState('');

  useEffect(() => {
    if (mode === 'demo') return;
    directory().then(setPeople, (err: Error) => setError(err.message));
  }, [mode]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (people ?? []).filter((p) => !needle || p.username.includes(needle) || p.displayName?.toLowerCase().includes(needle));
  }, [people, q]);

  return (
    <div className="page people-page">
      <div className="page-head">
        <span className="kicker">The listening room</span>
        <h1>People</h1>
        <p className="muted">
          {mode === 'live'
            ? 'Everyone whose crate you can see. Their profile settings decide who that is.'
            : 'Listeners with public profiles. Sign in to see members-only crates too.'}
        </p>
      </div>

      {mode === 'demo' ? (
        <Notice>The demo is just you and a crate of classics. Create an account to see what everyone else is spinning.</Notice>
      ) : error ? (
        <Notice tone="error">{error}</Notice>
      ) : !people ? (
        <Spinner label="Looking around the room…" />
      ) : (
        <>
          <div className="toolbar">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a listener…" aria-label="Find a listener" />
          </div>
          {shown.length === 0 ? (
            <p className="muted empty-chart">{people.length ? 'Nobody by that name.' : 'No listeners to show yet.'}</p>
          ) : (
            <ul className="people-grid">
              {shown.map((p) => {
                const isMe = p.username === me?.username;
                const vis = VISIBILITY_LABEL[p.visibility];
                return (
                  <li key={p.username}>
                    <a className="person card" href={href(isMe ? '/' : `/u/${p.username}`)}>
                      <span className="person-disc" aria-hidden="true">
                        {(p.displayName ?? p.username).charAt(0).toUpperCase()}
                      </span>
                      <span className="person-text">
                        <strong>{p.displayName ?? p.username}</strong>
                        <span className="muted">
                          @{p.username}
                          {isMe && ' · you'}
                        </span>
                        <span className="person-stats">
                          {plural(p.records, 'record')} · {fmtNumber(p.spins)} spins
                          {p.lastSpin ? ` · last spin ${fmtAgo(p.lastSpin.slice(0, 10))}` : ''}
                        </span>
                      </span>
                      {isMe && (
                        <span className="person-badge" title={vis.detail}>
                          {vis.icon} {vis.label}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
