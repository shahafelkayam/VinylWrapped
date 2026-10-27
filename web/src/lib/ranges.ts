import type { Library } from '../../../shared/types.ts';
import { libraryExtent, type DateRange } from '../../../shared/stats.ts';
import { addDays, formatDate } from '../../../shared/time.ts';

export type PresetId = '7d' | '30d' | '90d' | 'year' | 'last-year' | 'all' | 'custom';

export interface ResolvedRange {
  id: PresetId;
  range: DateRange;
  label: string;
  /** "this week", "in 2025"... for sentences. */
  phrase: string;
}

export function presets(today: string): { id: Exclude<PresetId, 'custom'>; label: string }[] {
  const year = Number(today.slice(0, 4));
  return [
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: '90d', label: '90 days' },
    { id: 'year', label: String(year) },
    { id: 'last-year', label: String(year - 1) },
    { id: 'all', label: 'All time' },
  ];
}

export function resolveRange(query: URLSearchParams, today: string, library: Library): ResolvedRange {
  const year = Number(today.slice(0, 4));
  const id = (query.get('range') as PresetId | null) ?? '30d';
  const from = query.get('from');
  const to = query.get('to');
  switch (id) {
    case '7d':
      return { id, range: { from: addDays(today, -6), to: today }, label: 'Last 7 days', phrase: 'this past week' };
    case '90d':
      return { id, range: { from: addDays(today, -89), to: today }, label: 'Last 90 days', phrase: 'in the last 90 days' };
    case 'year':
      return { id, range: { from: `${year}-01-01`, to: today }, label: `${year} so far`, phrase: `in ${year}` };
    case 'last-year':
      return { id, range: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }, label: String(year - 1), phrase: `in ${year - 1}` };
    case 'all':
      return { id, range: libraryExtent(library, today), label: 'All time', phrase: 'all time' };
    case 'custom':
      if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
        return { id, range: { from, to }, label: `${formatDate(from)} – ${formatDate(to)}`, phrase: `between ${formatDate(from)} and ${formatDate(to)}` };
      }
      return { id: '30d', range: { from: addDays(today, -29), to: today }, label: 'Last 30 days', phrase: 'in the last 30 days' };
    default:
      return { id: '30d', range: { from: addDays(today, -29), to: today }, label: 'Last 30 days', phrase: 'in the last 30 days' };
  }
}
