// Another listener's pages (/u/<username>/…): their stats, Wrapped, crate and records, read-only.
// What loads is decided by the database: a private profile simply comes back empty.
import { useEffect, useState, type ReactNode } from 'react';
import type { Library } from '../../../shared/types.ts';
import { fetchLibrary, profileByUsername, type Profile } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';
import { href, navigate } from '../lib/router.ts';
import { ViewProvider } from '../lib/view.tsx';
import { Notice, Spinner } from '../components/bits.tsx';
import { Vinyl } from '../components/Vinyl.tsx';
import { VISIBILITY_LABEL } from './PeoplePage.tsx';

type State = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; profile: Profile; library: Library };

export function ProfilePage({ username, subPath, children }: { username: string; subPath: string; children: ReactNode }) {
  const { me, mode } = useStore();
  const [state, setState] = useState<State>({ status: 'loading' });
  const isMe = me?.username === username.toLowerCase();

  useEffect(() => {
    // Your own profile lives at the top-level routes, where you can also edit it.
    if (isMe) navigate(subPath || '/', { replace: true });
  }, [isMe, subPath]);

  useEffect(() => {
    if (isMe || mode === 'demo') return;
    let alive = true;
    setState({ status: 'loading' });
    profileByUsername(username)
      .then(async (profile) => {
        if (!profile) return { status: 'missing' } as const;
        return { status: 'ready', profile, library: await fetchLibrary(profile.id) } as const;
      })
      .then(
        (s) => alive && setState(s),
        (err: Error) => alive && setState({ status: 'error', message: err.message }),
      );
    return () => {
      alive = false;
    };
  }, [username, isMe, mode]);

  if (mode === 'demo') {
    return (
      <div className="page narrow">
        <Notice>Profiles of other listeners aren’t part of the demo. Create an account to visit them.</Notice>
      </div>
    );
  }
  if (isMe || state.status === 'loading') return <Spinner label={`Visiting @${username}…`} />;
  if (state.status === 'error') {
    return (
      <div className="page narrow">
        <Notice tone="error">{state.message}</Notice>
      </div>
    );
  }
  if (state.status === 'missing') {
    return (
      <div className="page narrow">
        <section className="card quiet-card">
          <Vinyl size={110} />
          <div>
            <h1>Nothing on this shelf</h1>
            <p>
              Either there’s no listener called <strong>@{username}</strong>, or they keep their crate {mode === 'live' ? 'private' : 'for members only'}.
              {mode !== 'live' && (
                <>
                  {' '}
                  <a href={href('/login')}>Sign in</a> to see members-only profiles.
                </>
              )}
            </p>
          </div>
        </section>
      </div>
    );
  }

  const { profile, library } = state;
  const base = `/u/${profile.username}`;
  const vis = VISIBILITY_LABEL[profile.visibility];
  const tabs = [
    { to: base, label: 'Stats', active: subPath === '' },
    { to: `${base}/wrapped`, label: 'Wrapped', active: subPath.startsWith('/wrapped') },
    { to: `${base}/crate`, label: 'Crate', active: subPath.startsWith('/crate') || subPath.startsWith('/record') },
  ];

  return (
    <ViewProvider value={{ library, readOnly: true, owner: profile, base }}>
      <div className="page profile-head">
        <div className="profile-banner card">
          <span className="person-disc person-disc-big" aria-hidden="true">
            {(profile.displayName ?? profile.username).charAt(0).toUpperCase()}
          </span>
          <div className="profile-names">
            <h1>{profile.displayName ?? `@${profile.username}`}</h1>
            <p className="muted">
              @{profile.username} · <span title={vis.detail}>{vis.icon} {vis.label} profile</span>
            </p>
          </div>
          <nav className="profile-tabs" aria-label={`@${profile.username}’s pages`}>
            {tabs.map((t) => (
              <a key={t.to} href={href(t.to)} className="nav-link" aria-current={t.active ? 'page' : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
      {children}
    </ViewProvider>
  );
}
