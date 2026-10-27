// A small hash router: GitHub Pages serves one static file, and hash URLs are also what we
// write onto NFC tags (…/#/spin/abbey-road).
import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (opts.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

export const href = (to: string) => `#${to}`;
