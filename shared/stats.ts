// The stats engine. Pure functions over a Library: no DOM, no network, fully unit-testable.
import { DEFAULT_RECORD_MS, type Library, type Listen, type VinylRecord } from './types.ts';
import { addDays, diffDays, instantOf, localParts, startOfWeek, type LocalParts } from './time.ts';
import { recordFamily } from './genres.ts';
import { describePersonality, type Personality } from './personality.ts';

export interface DateRange {
  /** Inclusive local date, "YYYY-MM-DD". */
  from: string;
  /** Inclusive local date, "YYYY-MM-DD". */
  to: string;
}

export interface ResolvedListen extends Listen {
  local: LocalParts;
  instant: number;
  rec?: VinylRecord;
  minutes: number;
}

export interface Ranked<T> {
  key: string;
  item: T;
  count: number;
  minutes: number;
  /** count / total spins in range. */
  share: number;
}

export interface ArtistSummary {
  name: string;
  mbid?: string;
  country?: string;
  type?: string;
  /** A record by this artist, handy for showing a cover. */
  sample?: VinylRecord;
}

export interface Bucket {
  /** First local date covered by the bucket. */
  start: string;
  count: number;
  minutes: number;
}

export type Granularity = 'day' | 'week' | 'month';

export interface Streak {
  length: number;
  from?: string;
  to?: string;
}

export interface RecordMoment {
  record: VinylRecord;
  date: string;
  /** Extra number: spins that day for binges, days since last spin for comebacks. */
  value: number;
}

export interface DustyRecord {
  record: VinylRecord;
  /** Last spin ever (local date), or undefined if it has never been played. */
  lastSpin?: string;
}

export interface Session {
  date: string;
  start: string;
  spins: number;
  minutes: number;
  records: VinylRecord[];
}

export interface Stats {
  range: DateRange;
  days: number;
  listens: ResolvedListen[];
  totals: {
    spins: number;
    minutes: number;
    records: number;
    artists: number;
    genres: number;
    activeDays: number;
    discoveries: number;
  };
  previous: { range: DateRange; spins: number; minutes: number; records: number };
  topRecords: Ranked<VinylRecord>[];
  topArtists: Ranked<ArtistSummary>[];
  topGenres: Ranked<string>[];
  topFamilies: Ranked<string>[];
  topLabels: Ranked<string>[];
  topCountries: Ranked<string>[];
  decades: Ranked<number>[];
  /** Spins per local hour, 0–23. */
  hours: number[];
  /** Spins per weekday, Monday first. */
  weekdays: number[];
  /** [weekday][hour]. */
  heat: number[][];
  daily: Map<string, number>;
  granularity: Granularity;
  trend: Bucket[];
  longestStreak: Streak;
  currentStreak: Streak;
  peakDay?: { date: string; count: number };
  binge?: RecordMoment;
  longestSession?: Session;
  sessions: number;
  discoveries: RecordMoment[];
  comebacks: RecordMoment[];
  dusty: DustyRecord[];
  firstSpin?: ResolvedListen;
  lastSpin?: ResolvedListen;
  era: {
    averageYear?: number;
    medianYear?: number;
    oldest?: VinylRecord;
    newest?: VinylRecord;
    /** Average age of a record at the moment you played it. */
    averageAgeAtSpin?: number;
  };
  /** 0–1, normalized Shannon entropy of genre families. */
  diversity: number;
  shares: { night: number; morning: number; weekend: number; topRecord: number; topFamily: number };
  /** Tag ids that were scanned but are not linked to a record yet. */
  unlinkedTags: { id: string; count: number; lastAt: string }[];
  personality: Personality;
}

export interface StatsOptions {
  /** Local "today"; defaults to the range end. Used for the current streak. */
  today?: string;
  /** Weekend days, Monday = 0 … Sunday = 6. */
  weekend?: number[];
  /** Records you haven't spun in this many days count as a comeback when played. */
  comebackDays?: number;
}

const SESSION_SLACK_MIN = 90;

export function minutesOf(rec?: VinylRecord): number {
  return (rec?.durationMs || DEFAULT_RECORD_MS) / 60_000;
}

export function resolveListens(library: Library): ResolvedListen[] {
  return library.listens
    .map((l) => {
      const rec = library.records[l.record];
      return { ...l, local: localParts(l.at), instant: instantOf(l.at), rec, minutes: minutesOf(rec) };
    })
    .sort((a, b) => a.instant - b.instant);
}

export function rangeDays(range: DateRange): number {
  return diffDays(range.from, range.to) + 1;
}

export function previousRange(range: DateRange): DateRange {
  const days = rangeDays(range);
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

/** The span covered by the whole library, for "All time". */
export function libraryExtent(library: Library, today: string): DateRange {
  let from = today;
  for (const l of library.listens) {
    const d = l.at.slice(0, 10);
    if (d < from) from = d;
  }
  return { from, to: today };
}

class Counter<T> {
  private map = new Map<string, { item: T; count: number; minutes: number }>();
  add(key: string, item: T, minutes: number, weight = 1) {
    const cur = this.map.get(key);
    if (cur) {
      cur.count += weight;
      cur.minutes += minutes;
    } else {
      this.map.set(key, { item, count: weight, minutes });
    }
  }
  get size() {
    return this.map.size;
  }
  ranked(total: number, tieBreak?: (a: T, b: T) => number): Ranked<T>[] {
    return [...this.map.entries()]
      .map(([key, v]) => ({ key, item: v.item, count: v.count, minutes: v.minutes, share: total ? v.count / total : 0 }))
      .sort((a, b) => b.count - a.count || b.minutes - a.minutes || (tieBreak ? tieBreak(a.item, b.item) : a.key.localeCompare(b.key)));
  }
}

export function granularityFor(range: DateRange): Granularity {
  const days = rangeDays(range);
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

export function bucketStart(date: string, g: Granularity): string {
  if (g === 'day') return date;
  if (g === 'week') return startOfWeek(date);
  return `${date.slice(0, 7)}-01`;
}

function nextBucket(start: string, g: Granularity): string {
  if (g === 'day') return addDays(start, 1);
  if (g === 'week') return addDays(start, 7);
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function emptyBuckets(range: DateRange, g: Granularity): Bucket[] {
  const out: Bucket[] = [];
  for (let s = bucketStart(range.from, g); s <= range.to; s = nextBucket(s, g)) out.push({ start: s, count: 0, minutes: 0 });
  return out;
}

function longestRun(dates: string[]): Streak {
  let best: Streak = { length: 0 };
  let runStart = '';
  let prev = '';
  let len = 0;
  for (const d of dates) {
    if (prev && diffDays(prev, d) === 1) {
      len += 1;
    } else {
      len = 1;
      runStart = d;
    }
    if (len > best.length) best = { length: len, from: runStart, to: d };
    prev = d;
  }
  return best;
}

function entropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total || counts.length < 2) return 0;
  let h = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(counts.length);
}

function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function computeStats(library: Library, range: DateRange, options: StatsOptions = {}): Stats {
  const weekend = options.weekend ?? [5, 6];
  const comebackDays = options.comebackDays ?? 180;
  const today = options.today ?? range.to;

  const all = resolveListens(library);
  const listens = all.filter((l) => inRange(l.local.date, range));
  const prevRange = previousRange(range);
  const prevListens = all.filter((l) => inRange(l.local.date, prevRange));

  const spins = listens.length;
  const records = new Counter<VinylRecord>();
  const artists = new Counter<ArtistSummary>();
  const genres = new Counter<string>();
  const families = new Counter<string>();
  const labels = new Counter<string>();
  const countries = new Counter<string>();
  const decades = new Counter<number>();
  const hours = Array<number>(24).fill(0);
  const weekdays = Array<number>(7).fill(0);
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const daily = new Map<string, number>();
  const granularity = granularityFor(range);
  const trend = emptyBuckets(range, granularity);
  const trendIndex = new Map(trend.map((b, i) => [b.start, i]));
  const unlinked = new Map<string, { id: string; count: number; lastAt: string }>();
  const perDayRecord = new Map<string, number>();
  const years: number[] = [];
  let minutes = 0;
  let ageSum = 0;
  let ageCount = 0;
  let night = 0;
  let morning = 0;
  let weekendCount = 0;

  for (const l of listens) {
    const { rec, local } = l;
    minutes += l.minutes;
    hours[local.hour] += 1;
    weekdays[local.weekday] += 1;
    heat[local.weekday][local.hour] += 1;
    daily.set(local.date, (daily.get(local.date) ?? 0) + 1);
    const bucket = trendIndex.get(bucketStart(local.date, granularity));
    if (bucket !== undefined) {
      trend[bucket].count += 1;
      trend[bucket].minutes += l.minutes;
    }
    if (local.hour >= 21 || local.hour < 4) night += 1;
    if (local.hour >= 5 && local.hour < 11) morning += 1;
    if (weekend.includes(local.weekday)) weekendCount += 1;

    if (!rec) {
      const u = unlinked.get(l.record) ?? { id: l.record, count: 0, lastAt: l.at };
      u.count += 1;
      u.lastAt = l.at;
      unlinked.set(l.record, u);
      continue;
    }

    records.add(rec.id, rec, l.minutes);
    const dayKey = `${local.date}|${rec.id}`;
    perDayRecord.set(dayKey, (perDayRecord.get(dayKey) ?? 0) + 1);

    if (rec.artists.length) {
      for (const a of rec.artists) {
        artists.add(a.mbid ?? a.name.toLowerCase(), { name: a.name, mbid: a.mbid, country: a.country, type: a.type, sample: rec }, l.minutes);
      }
    } else if (rec.artistCredit) {
      artists.add(rec.artistCredit.toLowerCase(), { name: rec.artistCredit, sample: rec }, l.minutes);
    }
    for (const g of rec.genres.slice(0, 3)) genres.add(g.toLowerCase(), g, l.minutes);
    const family = recordFamily(rec.genres);
    families.add(family, family, l.minutes);
    if (rec.label) labels.add(rec.label.toLowerCase(), rec.label, l.minutes);
    const country = rec.artists[0]?.country;
    if (country) countries.add(country, country, l.minutes);
    if (rec.year) {
      years.push(rec.year);
      const decade = Math.floor(rec.year / 10) * 10;
      decades.add(String(decade), decade, l.minutes);
      ageSum += local.year - rec.year;
      ageCount += 1;
    }
  }

  // --- Per-record history (all time) for discoveries, comebacks and dusty crates.
  const history = new Map<string, ResolvedListen[]>();
  for (const l of all) {
    if (!l.rec) continue;
    const h = history.get(l.record);
    if (h) h.push(l);
    else history.set(l.record, [l]);
  }

  const discoveries: RecordMoment[] = [];
  const comebacks: RecordMoment[] = [];
  const dusty: DustyRecord[] = [];
  for (const rec of Object.values(library.records)) {
    const h = history.get(rec.id) ?? [];
    const first = h[0];
    if (first && inRange(first.local.date, range)) {
      discoveries.push({ record: rec, date: first.local.date, value: h.filter((l) => inRange(l.local.date, range)).length });
    }
    let bestGap = 0;
    let bestDate = '';
    for (let i = 1; i < h.length; i++) {
      if (!inRange(h[i].local.date, range)) continue;
      const gap = diffDays(h[i - 1].local.date, h[i].local.date);
      if (gap >= comebackDays && gap > bestGap) {
        bestGap = gap;
        bestDate = h[i].local.date;
      }
    }
    if (bestGap) comebacks.push({ record: rec, date: bestDate, value: bestGap });
    if (!h.some((l) => inRange(l.local.date, range))) {
      const before = h.filter((l) => l.local.date < range.from);
      const lastSpin = before.at(-1)?.local.date;
      // Records added after the range ended weren't in the crate yet.
      if (rec.addedAt.slice(0, 10) <= range.to || lastSpin) dusty.push({ record: rec, lastSpin });
    }
  }
  discoveries.sort((a, b) => a.date.localeCompare(b.date));
  comebacks.sort((a, b) => b.value - a.value);
  dusty.sort((a, b) => (a.lastSpin ?? '').localeCompare(b.lastSpin ?? '') || a.record.title.localeCompare(b.record.title));

  // --- Sessions: back-to-back records with little silence in between.
  let sessions = 0;
  let longestSession: Session | undefined;
  let current: Session | undefined;
  let prev: ResolvedListen | undefined;
  for (const l of listens) {
    const continues = prev && l.instant - prev.instant <= (prev.minutes + SESSION_SLACK_MIN) * 60_000;
    if (!continues) {
      sessions += 1;
      current = { date: l.local.date, start: l.at, spins: 0, minutes: 0, records: [] };
    }
    current!.spins += 1;
    current!.minutes += l.minutes;
    if (l.rec) current!.records.push(l.rec);
    if (!longestSession || current!.spins > longestSession.spins || (current!.spins === longestSession.spins && current!.minutes > longestSession.minutes)) {
      longestSession = current;
    }
    prev = l;
  }
  if (longestSession) longestSession = { ...longestSession, records: [...longestSession.records] };

  // --- Binge: most spins of a single record on a single day.
  let binge: RecordMoment | undefined;
  for (const [key, count] of perDayRecord) {
    if (count < 2) continue;
    const [date, id] = key.split('|');
    if (!binge || count > binge.value) binge = { record: library.records[id], date, value: count };
  }

  // --- Peak day.
  let peakDay: Stats['peakDay'];
  for (const [date, count] of daily) if (!peakDay || count > peakDay.count) peakDay = { date, count };

  // --- Streaks.
  const activeDates = [...daily.keys()].sort();
  const longestStreak = longestRun(activeDates);
  const allDates = [...new Set(all.map((l) => l.local.date))].filter((d) => d <= today).sort();
  let currentStreak: Streak = { length: 0 };
  const lastActive = allDates.at(-1);
  if (lastActive && diffDays(lastActive, today) <= 1) {
    let len = 1;
    for (let i = allDates.length - 1; i > 0 && diffDays(allDates[i - 1], allDates[i]) === 1; i--) len += 1;
    currentStreak = { length: len, from: addDays(lastActive, -(len - 1)), to: lastActive };
  }

  // --- Era.
  const spunRecords = records.ranked(spins).map((r) => r.item);
  const withYear = spunRecords.filter((r) => r.year);
  const era: Stats['era'] = {
    averageYear: years.length ? Math.round(years.reduce((a, b) => a + b, 0) / years.length) : undefined,
    medianYear: median(years),
    oldest: withYear.reduce<VinylRecord | undefined>((o, r) => (!o || r.year! < o.year! ? r : o), undefined),
    newest: withYear.reduce<VinylRecord | undefined>((n, r) => (!n || r.year! > n.year! ? r : n), undefined),
    averageAgeAtSpin: ageCount ? Math.round(ageSum / ageCount) : undefined,
  };

  const topRecords = records.ranked(spins, (a, b) => a.title.localeCompare(b.title));
  const topFamilies = families.ranked(spins);
  const linkedSpins = spins - [...unlinked.values()].reduce((a, u) => a + u.count, 0);

  const partial = {
    spins,
    linkedSpins,
    uniqueRecords: records.size,
    nightShare: spins ? night / spins : 0,
    morningShare: spins ? morning / spins : 0,
    weekendShare: spins ? weekendCount / spins : 0,
    weekendBaseline: weekend.length / 7,
    topRecordShare: topRecords[0]?.share ?? 0,
    topFamilyShare: topFamilies[0]?.share ?? 0,
    diversity: entropy(topFamilies.map((f) => f.count)),
    medianYear: era.medianYear,
    averageAgeAtSpin: era.averageAgeAtSpin,
    discoveries: discoveries.length,
    longestSessionSpins: longestSession?.spins ?? 0,
    activeDays: daily.size,
    days: rangeDays(range),
    topFamily: topFamilies[0]?.item,
  };

  return {
    range,
    days: rangeDays(range),
    listens,
    totals: {
      spins,
      minutes,
      records: records.size,
      artists: artists.size,
      genres: genres.size,
      activeDays: daily.size,
      discoveries: discoveries.length,
    },
    previous: {
      range: prevRange,
      spins: prevListens.length,
      minutes: prevListens.reduce((a, l) => a + l.minutes, 0),
      records: new Set(prevListens.map((l) => l.record)).size,
    },
    topRecords,
    topArtists: artists.ranked(spins, (a, b) => a.name.localeCompare(b.name)),
    topGenres: genres.ranked(spins),
    topFamilies,
    topLabels: labels.ranked(spins),
    topCountries: countries.ranked(spins),
    decades: decades.ranked(spins).sort((a, b) => a.item - b.item),
    hours,
    weekdays,
    heat,
    daily,
    granularity,
    trend,
    longestStreak,
    currentStreak,
    peakDay,
    binge,
    longestSession,
    sessions,
    discoveries,
    comebacks,
    dusty,
    firstSpin: listens[0],
    lastSpin: listens.at(-1),
    era,
    diversity: partial.diversity,
    shares: {
      night: partial.nightShare,
      morning: partial.morningShare,
      weekend: partial.weekendShare,
      topRecord: partial.topRecordShare,
      topFamily: partial.topFamilyShare,
    },
    unlinkedTags: [...unlinked.values()].sort((a, b) => b.count - a.count),
    personality: describePersonality(partial),
  };
}

// ---------------------------------------------------------------------------
// Single-record stats, for the record detail page and the "now spinning" screen.
// ---------------------------------------------------------------------------

export interface RecordStats {
  spins: number;
  minutes: number;
  firstSpin?: string;
  lastSpin?: string;
  /** All-time rank by spins, 1-based. */
  rank?: number;
  favoriteHour?: number;
  /** Last 12 months, oldest first. */
  monthly: Bucket[];
  history: ResolvedListen[];
}

export function computeRecordStats(library: Library, id: string, today: string): RecordStats {
  const all = resolveListens(library);
  const history = all.filter((l) => l.record === id);
  const counts = new Map<string, number>();
  for (const l of all) if (l.rec) counts.set(l.record, (counts.get(l.record) ?? 0) + 1);
  const mine = counts.get(id) ?? 0;
  const rank = mine ? 1 + [...counts.values()].filter((c) => c > mine).length : undefined;

  const hours = Array<number>(24).fill(0);
  for (const l of history) hours[l.local.hour] += 1;
  const maxHour = Math.max(...hours);

  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4, 7)}-01`;
  const range = { from: nextBucket(yearAgo, 'month'), to: today };
  const monthly = emptyBuckets(range, 'month');
  const index = new Map(monthly.map((b, i) => [b.start, i]));
  for (const l of history) {
    const i = index.get(bucketStart(l.local.date, 'month'));
    if (i !== undefined) {
      monthly[i].count += 1;
      monthly[i].minutes += l.minutes;
    }
  }

  return {
    spins: history.length,
    minutes: history.reduce((a, l) => a + l.minutes, 0),
    firstSpin: history[0]?.local.date,
    lastSpin: history.at(-1)?.local.date,
    rank,
    favoriteHour: maxHour > 0 ? hours.indexOf(maxHour) : undefined,
    monthly,
    history,
  };
}
