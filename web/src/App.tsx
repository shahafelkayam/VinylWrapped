import { useEffect, type ReactNode } from 'react';
import { useStore } from './lib/store.tsx';
import { href, navigate, useRoute, type Route } from './lib/router.ts';
import { plural } from './lib/format.ts';
import { Notice, Spinner, Stripes } from './components/bits.tsx';
import { Vinyl } from './components/Vinyl.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { SpinPage } from './pages/SpinPage.tsx';
import { CratePage } from './pages/CratePage.tsx';
import { RecordPage } from './pages/RecordPage.tsx';
import { AddRecordPage } from './pages/AddRecordPage.tsx';
import { LogPage } from './pages/LogPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { WrappedPage } from './pages/WrappedPage.tsx';

const NAV = [
  { to: '/', page: '', label: 'Stats', icon: '◉' },
  { to: '/wrapped', page: 'wrapped', label: 'Wrapped', icon: '★' },
  { to: '/crate', page: 'crate', label: 'Crate', icon: '▤' },
  { to: '/log', page: 'log', label: 'Log', icon: '☰' },
  { to: '/add', page: 'add', label: 'Add', icon: '+' },
];

export function App() {
  const route = useRoute();
  const { mode } = useStore();
  const page = route.parts[0] ?? '';

  // Tag scans get their own full-screen experience (and their own login prompt).
  if (page === 'spin' || page === 'spun') return <SpinPage id={route.parts[1] ?? ''} doneListenId={page === 'spun' ? route.parts[2] : undefined} />;
  if (page === 'demo') return <DemoLink />;
  if (!mode) return <LoginPage />;

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

function Content({ route, page }: { route: Route; page: string }) {
  const { status, error, refresh } = useStore();
  if (status === 'loading' || status === 'idle') return <Spinner label="Cueing up your crate…" />;
  if (status === 'error') {
    return (
      <div className="page narrow">
        <Notice tone="error">
          Couldn't load your data: {error}{' '}
          <button className="link-button" onClick={() => void refresh()}>
            Try again
          </button>
        </Notice>
      </div>
    );
  }
  switch (page) {
    case '':
      return <StatsPage route={route} />;
    case 'wrapped':
      return <WrappedPage route={route} />;
    case 'crate':
      return <CratePage />;
    case 'record':
      return <RecordPage id={route.parts[1] ?? ''} />;
    case 'add':
      return <AddRecordPage route={route} key={route.query.toString()} />;
    case 'log':
      return <LogPage />;
    case 'settings':
      return <SettingsPage route={route} />;
    case 'login':
      return <StatsPage route={route} />;
    default:
      return (
        <div className="page narrow">
          <section className="card quiet-card">
            <Vinyl size={110} />
            <div>
              <h1>Wrong groove</h1>
              <p>
                This page skipped. <a href={href('/')}>Back to your stats</a>
              </p>
            </div>
          </section>
        </div>
      );
  }
}

function Layout({ page, children }: { page: string; children: ReactNode }) {
  const { mode, pending, session, error, status } = useStore();
  return (
    <div className="app">
      <header className="topbar">
        <a href={href('/')} className="logo">
          <Vinyl size={30} spinning={pending.length > 0} speed={1.6} className="logo-disc" />
          <span className="logo-vinyl">Vinyl</span>
          <span className="logo-wrapped">Wrapped</span>
        </a>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.to} href={href(n.to)} className="nav-link" aria-current={page === n.page ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
        <div className="topbar-end">
          {pending.length > 0 && (
            <span className="pressing-chip" title="Waiting for GitHub Actions to commit">
              pressing {plural(pending.length, 'event')}…
            </span>
          )}
          {mode === 'demo' && <span className="demo-chip">demo</span>}
          <a href={href('/settings')} className="settings-link" aria-current={page === 'settings' ? 'page' : undefined} aria-label="Settings">
            {session?.avatarUrl ? <img src={session.avatarUrl} alt="" className="avatar" /> : '⚙'}
          </a>
        </div>
      </header>
      <Stripes />
      {status === 'ready' && error && (
        <div className="page">
          <Notice tone="warn">Couldn't refresh from GitHub ({error}). Showing what we had.</Notice>
        </div>
      )}
      <main>{children}</main>
      <footer className="footer">
        <span>VinylWrapped · side B ends here</span>
        <a href={href('/settings?section=nfc')}>NFC setup</a>
      </footer>
    </div>
  );
}
