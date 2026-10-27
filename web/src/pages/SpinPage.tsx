// What you see after tapping your phone on a record's NFC sticker: the needle drops, the spin is logged.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DUPLICATE_SPIN_WINDOW_MS, type VinylRecord } from '../../../shared/types.ts';
import { computeRecordStats } from '../../../shared/stats.ts';
import { formatHour, instantOf, todayLocal, toLocalIso } from '../../../shared/time.ts';
import { isValidRecordId, newListenId } from '../../../shared/ids.ts';
import { useStore } from '../lib/store.tsx';
import { href, navigate } from '../lib/router.ts';
import { fmtAgo, fmtTime, ordinal } from '../lib/format.ts';
import { Turntable } from '../components/Turntable.tsx';
import { Notice } from '../components/bits.tsx';
import { LoginPage } from './LoginPage.tsx';

type Phase = 'cueing' | 'duplicate' | 'sending' | 'sent' | 'error' | 'invalid';

/** First side's length: from the tracklist when we have one, otherwise an even split. */
export function firstSideMinutes(rec: VinylRecord): number | undefined {
  const sideA = rec.tracks.filter((t) => /^A\d*$/i.test(t.position));
  if (sideA.length && sideA.every((t) => t.lengthMs)) return sideA.reduce((a, t) => a + t.lengthMs!, 0) / 60_000;
  if (rec.durationMs) return rec.durationMs / 60_000 / ((rec.discs ?? 1) * 2);
  return undefined;
}

export function SpinPage({ id, doneListenId }: { id: string; doneListenId?: string }) {
  const { mode, library, status, pending, send } = useStore();
  const [phase, setPhase] = useState<Phase>(doneListenId ? 'sent' : 'cueing');
  const [listenId, setListenId] = useState(doneListenId ?? '');
  const [dupeAt, setDupeAt] = useState<string>();
  const [error, setError] = useState<string>();
  const [spunAt] = useState(() => new Date());
  const started = useRef(false);
  const rec = library.records[id];

  const log = async (force: boolean) => {
    const lid = newListenId();
    setListenId(lid);
    setPhase('sending');
    try {
      await send('spin', { record: id, id: lid, at: toLocalIso(spunAt), source: 'nfc', ...(force ? { force: true } : {}) });
      setPhase('sent');
      // Swap the URL so a refresh doesn't log the spin twice.
      navigate(`/spun/${id}/${lid}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  };

  useEffect(() => {
    if (!mode || doneListenId || started.current) return;
    if (status !== 'ready' && status !== 'error') return;
    started.current = true;
    if (!isValidRecordId(id)) {
      setPhase('invalid');
      return;
    }
    const recent = library.listens.filter((l) => l.record === id).at(-1);
    if (recent && Math.abs(Date.now() - instantOf(recent.at)) < DUPLICATE_SPIN_WINDOW_MS) {
      setDupeAt(recent.at);
      setPhase('duplicate');
      return;
    }
    void log(false);
  }, [mode, status, id, doneListenId]);

  const facts = useMemo(() => (rec ? computeRecordStats(library, id, todayLocal()) : undefined), [library, id, rec]);

  if (!mode) return <LoginPage compact returnTo={`/spin/${id}`} />;

  const confirmed = phase === 'sent' && !pending.some((p) => p.type === 'spin' && (p.payload as { id?: string }).id === listenId);
  const playing = phase === 'sending' || phase === 'sent';
  const previous = facts?.history.filter((l) => l.id !== listenId).at(-1);
  const side = rec ? firstSideMinutes(rec) : undefined;

  return (
    <div className="spin-page">
      <header className="spin-header">
        <a href={href('/')} className="logo logo-small">
          <span className="logo-vinyl">Vinyl</span>
          <span className="logo-wrapped">Wrapped</span>
        </a>
        <a href={href('/')} className="spin-header-link">
          Stats →
        </a>
      </header>

      <div className="spin-stage">
        <Turntable playing={playing} labelImage={rec?.coverUrl} />
      </div>

      <div className="spin-copy">
        <span className="spin-status" aria-live="polite">
          {phase === 'cueing' && 'Cueing up…'}
          {phase === 'sending' && 'Dropping the needle…'}
          {phase === 'sent' && (confirmed ? 'Pressed into your archive ✓' : 'Logged, pressing into your archive…')}
          {phase === 'duplicate' && 'Already spinning'}
          {phase === 'error' && 'The needle skipped'}
          {phase === 'invalid' && 'Unreadable tag'}
        </span>

        {rec ? (
          <>
            <h1 className="spin-title">{rec.title}</h1>
            <p className="spin-artist">
              {rec.artistCredit}
              {rec.year ? ` · ${rec.year}` : ''}
            </p>
          </>
        ) : (
          status === 'ready' && phase !== 'invalid' && <h1 className="spin-title">New tag!</h1>
        )}

        {phase === 'duplicate' && dupeAt && (
          <div className="spin-panel">
            <p>
              You logged this record at {fmtTime(dupeAt)}, just a few minutes ago. Flipped to side B? That's still the same spin.
            </p>
            <div className="btn-row">
              <button className="btn" onClick={() => log(true)}>
                Log another spin anyway
              </button>
              <a className="btn btn-ghost" href={href(rec ? `/record/${id}` : '/')}>
                Never mind
              </a>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <Notice tone="error">
            Couldn't reach GitHub: {error}{' '}
            <button className="link-button" onClick={() => log(false)}>
              Try again
            </button>
          </Notice>
        )}

        {phase === 'invalid' && (
          <Notice tone="error">
            This tag points to <code>{id}</code>, which isn't a valid record id. Rewrite the tag with a link from a record's page.
          </Notice>
        )}

        {playing && rec && facts && (
          <ul className="spin-facts">
            <li>
              <strong>{ordinal(facts.spins)}</strong> spin of this record
            </li>
            {previous ? (
              <li>
                last played <strong>{fmtAgo(previous.local.date)}</strong>
              </li>
            ) : (
              <li>
                <strong>first time</strong> on the platter. Enjoy!
              </li>
            )}
            {facts.rank && facts.spins > 1 && (
              <li>
                {facts.rank === 1 ? (
                  <>
                    your <strong>most played</strong> record of all time
                  </>
                ) : (
                  <>
                    your <strong>{ordinal(facts.rank)}</strong> most played record
                  </>
                )}
              </li>
            )}
            {facts.favoriteHour !== undefined && facts.spins > 3 && (
              <li>
                usually spun around <strong>{formatHour(facts.favoriteHour)}</strong>
              </li>
            )}
            {side && (
              <li className="spin-flip">
                Side A runs ~{Math.round(side)} min. Flip around <strong>{fmtTime(toLocalIso(new Date(spunAt.getTime() + side * 60_000)))}</strong>
              </li>
            )}
          </ul>
        )}

        {playing && !rec && status === 'ready' && (
          <div className="spin-panel">
            <p>
              This sticker (<code>{id}</code>) isn't linked to a record yet. The spin is saved; link the tag and it will count toward your stats.
            </p>
            <a className="btn" href={href(`/add?tag=${id}`)}>
              Link this tag to a record
            </a>
          </div>
        )}

        {mode === 'demo' && <p className="spin-demo-note">Demo mode: nothing is sent anywhere.</p>}
      </div>
    </div>
  );
}
