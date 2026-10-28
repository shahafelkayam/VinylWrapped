import { useEffect, type ReactNode } from 'react';
import { useStore } from './lib/store.tsx';
import { href, navigate, useRoute, type Route } from './lib/router.ts';
import { plural } from './lib/format.ts';
import { ViewProvider } from './lib/view.tsx';
import { Notice, Spinner, Stripes } from './components/bits.tsx';
import { Vinyl } from './components/Vinyl.tsx';
import { AuthPage, ResetPasswordPage } from './pages/AuthPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { SpinPage } from './pages/SpinPage.tsx';
import { CratePage } from './pages/CratePage.tsx';
import { RecordPage } from './pages/RecordPage.tsx';
import { AddRecordPage } from './pages/AddRecordPage.tsx';
import { LogPage } from './pages/LogPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { WrappedPage } from './pages/WrappedPage.tsx';
import { PeoplePage } from './pages/PeoplePage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';

const NAV = [
  { to: '/', page: '', label: 'Stats', icon: '◉' },
  { to: '/wrapped', page: 'wrapped', label: 'Wrapped', icon: '★' },
  { to: '/crate', page: 'crate', label: 'Crate', icon: '▤' },
  { to: '/people', page: 'people', label: 'People', icon: '☺' },
  { to: '/add', page: 'add', label: 'Add', icon: '+' },
];

/** Pages anyone can open, signed in or not (public profiles and the directory). */
const PUBLIC_PAGES = new Set(['u', 'people']);

export function App() {
  const route = useRoute();
  const { mode, authReady } = useStore();
  const page = route.parts[0] ?? '';

  // Email links (confirm, reset password) arrive with tokens in the URL; Supabase picks them up.
  if (/access_token=|error_description=/.test(route.path) && !route.path.startsWith('/')) return <AuthCallback />;
  if (!authReady) return <Spinner label="Cueing up…" />;

  // Tag scans get their own full-screen experience (and their own sign-in prompt).
  if (page === 'spin' || page === 'spun') return <SpinPage id={route.parts[1] ?? ''} doneListenId={page === 'spun' ? route.parts[2] : undefined} />;
  if (page === 'demo') return <DemoLink />;
  if (!mode && !PUBLIC_PAGES.has(page)) return <AuthPage initialTab={page === 'signup' ? 'signup' : 'signin'} returnTo={page === 'login' || page === 'signup' ? '/' : undefined} />;

  return (
    <Layout page={page}>
      <Content route={route} page={page} />
    </Layout>
  );
}

/** #/demo: a shareable link straight into the demo crate. */
function DemoLink() {
  const { mode, startDemo } = useStore();
  useEffect(() => {
    if (mode !== 'demo') startDemo();
    navigate('/', { replace: true });
  }, [mode, startDemo]);
  return <Spinner />;
}

/** Lands here from an emailed link; Supabase reads the tokens, then we continue. */
function AuthCallback() {
  const { recovering } = useStore();
  useEffect(() => {
    if (/error_description=/.test(location.hash)) return; // AuthPage shows the message
    const t = setTimeout(() => navigate(recovering ? '/reset-password' : '/', { replace: true }), 1200);
    return () => clearTimeout(t);
  }, [recovering]);
  if (/error_description=/.test(location.hash)) return <AuthPage />;
  return <Spinner label="Signing you in…" />;
}

/** Stats / Wrapped / Crate / Record pages, for whichever library the surrounding view provides. */
function ViewPages({ parts, route }: { parts: string[]; route: Route }) {
  switch (parts[0] ?? '') {
    case '':
      return <StatsPage route={route} />;
    case 'wrapped':
      return <WrappedPage yearParam={parts[1]} play={route.query.get('play') === '1'} />;
    case 'crate':
      return <CratePage />;
    case 'record':
      return <RecordPage id={parts[1] ?? ''} />;
    default:
      return <NotFound />;
  }
}

function Content({ route, page }: { route: Route; page: string }) {
  const { mode, status, error, refresh, library, recovering } = useStore();

  if (page === 'u') {
    const username = route.parts[1] ?? '';
    const sub = route.parts.slice(2);
    return (
      <ProfilePage username={username} subPath={sub.length ? `/${sub.join('/')}` : ''}>
        <ViewPages parts={sub} route={route} />
      </ProfilePage>
    );
  }
  if (page === 'people') return <PeoplePage />;
  if (page === 'reset-password') return recovering || mode === 'live' ? <ResetPasswordPage /> : <NotFound />;

  if (status === 'loading' || (status === 'idle' && mode === 'live')) return <Spinner label="Cueing up your crate…" />;
  if (status === 'error') {
    return (
      <div className="page narrow">
        <Notice tone="error">
          Couldn't load your crate: {error}{' '}
          <button className="link-button" onClick={() => void refresh()}>
            Try again
          </button>
        </Notice>
      </div>
    );
  }

  switch (page) {
    case '':
    case 'login':
    case 'signup':
    case 'wrapped':
    case 'crate':
    case 'record':
      return (
        <ViewProvider value={{ library, readOnly: false, base: '' }}>
          <ViewPages parts={page === 'login' || page === 'signup' ? [] : route.parts} route={route} />
        </ViewProvider>
      );
    case 'add':
      return <AddRecordPage route={route} key={route.query.toString()} />;
    case 'log':
      return <LogPage />;
    case 'settings':
      return <SettingsPage route={route} />;
    default:
      return <NotFound />;
  }
}

function NotFound() {
  return (
    <div className="page narrow">
      <section className="card quiet-card">
        <Vinyl size={110} />
        <div>
          <h1>Wrong groove</h1>
          <p>
            This page skipped. <a href={href('/')}>Back to the start</a>
          </p>
        </div>
      </section>
    </div>
  );
}

function Layout({ page, children }: { page: string; children: ReactNode }) {
  const { mode, me, pending, error, status, clearError } = useStore();
  const signedOut = !mode;
  const nav = signedOut ? NAV.filter((n) => n.page === 'people') : NAV;
  return (
    <div className="app">
      <header className="topbar">
        <a href={href('/')} className="logo">
          <Vinyl size={30} spinning={pending.length > 0} speed={1.6} className="logo-disc" />
          <span className="logo-vinyl">Vinyl</span>
          <span className="logo-wrapped">Wrapped</span>
        </a>
        <nav className="nav" aria-label="Main">
          {nav.map((n) => (
            <a key={n.to} href={href(n.to)} className="nav-link" aria-current={page === n.page ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
        <div className="topbar-end">
          {pending.length > 0 && <span className="pressing-chip">saving {plural(pending.length, 'change')}…</span>}
          {mode === 'demo' && <span className="demo-chip">demo</span>}
          {signedOut ? (
            <a href={href('/login')} className="btn btn-small">
              Sign in
            </a>
          ) : (
            <a
              href={href('/settings')}
              className="settings-link"
              aria-current={page === 'settings' ? 'page' : undefined}
              aria-label={me ? `Settings for @${me.username}` : 'Settings'}
              title={me ? `@${me.username}` : 'Settings'}
            >
              {me ? (me.displayName ?? me.username).charAt(0).toUpperCase() : '⚙'}
            </a>
          )}
        </div>
      </header>
      <Stripes />
      {status === 'ready' && error && (
        <div className="page">
          <Notice tone="warn">
            {error}{' '}
            <button className="link-button" onClick={clearError}>
              Dismiss
            </button>
          </Notice>
        </div>
      )}
      <main>{children}</main>
      <footer className="footer">
        <span>VinylWrapped · side B ends here</span>
        {!signedOut && (
          <span className="footer-links">
            <a href={href('/log')}>Logbook</a>
            <a href={href('/settings?section=nfc')}>NFC setup</a>
          </span>
        )}
      </footer>
    </div>
  );
}
