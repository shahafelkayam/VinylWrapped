// Whose crate is on screen. The Stats, Wrapped, Crate and Record pages render either your own
// library (editable) or another listener's (read-only, under /u/<username>).
import { createContext, useContext } from 'react';
import type { Library } from '../../../shared/types.ts';
import type { Profile } from './api.ts';
import { href } from './router.ts';

export interface View {
  library: Library;
  /** True on someone else's pages: hide everything that edits. */
  readOnly: boolean;
  /** The listener being viewed; undefined on your own pages and in the demo. */
  owner?: Profile;
  /** Route prefix: '' for your pages, '/u/<username>' for someone else's. */
  base: string;
}

const ViewContext = createContext<View | null>(null);

export const ViewProvider = ViewContext.Provider;

export function useView(): View {
  const view = useContext(ViewContext);
  if (!view) throw new Error('useView outside ViewProvider');
  return view;
}

/** Joins a page path onto the view's prefix: ('/u/alice', '/record/x') → '/u/alice/record/x'. */
export function viewPath(base: string, path: string): string {
  if (!base) return path;
  return path === '/' ? base : `${base}${path}`;
}

export function useViewLink(): (path: string) => string {
  const base = useContext(ViewContext)?.base ?? '';
  return (path) => href(viewPath(base, path));
}

/** "you/your" on your own pages, "they/their" on someone else's. */
export function usePronouns() {
  const other = Boolean(useContext(ViewContext)?.owner);
  return other ? { you: 'they', your: 'their', Your: 'Their' } : { you: 'you', your: 'your', Your: 'Your' };
}
