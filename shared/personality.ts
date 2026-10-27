// "Your listening personality", Wrapped-style. Picks the strongest *when* trait (an adjective)
// and the strongest *what* trait (a noun) and glues them into a title like "The Midnight Crate Digger".

export interface PersonalityInput {
  spins: number;
  linkedSpins: number;
  uniqueRecords: number;
  nightShare: number;
  morningShare: number;
  weekendShare: number;
  weekendBaseline: number;
  topRecordShare: number;
  topFamilyShare: number;
  diversity: number;
  medianYear?: number;
  averageAgeAtSpin?: number;
  discoveries: number;
  longestSessionSpins: number;
  activeDays: number;
  days: number;
  topFamily?: string;
}

export interface Trait {
  id: string;
  label: string;
  detail: string;
}

export interface Personality {
  title: string;
  tagline: string;
  traits: Trait[];
}

interface Candidate extends Trait {
  word: string;
  /** How strongly the data supports it; ≥ 1 means the threshold was met. */
  strength: number;
  tagline?: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function describePersonality(p: PersonalityInput): Personality {
  if (p.spins < 3) {
    return {
      title: 'The Fresh Needle',
      tagline: 'Spin a few more records and your listening personality will come into focus.',
      traits: [],
    };
  }

  const when: Candidate[] = [
    {
      id: 'night-owl',
      word: 'Midnight',
      label: 'Night Owl',
      detail: `${pct(p.nightShare)} of your spins happened between 9pm and 4am.`,
      strength: p.nightShare / 0.4,
    },
    {
      id: 'early-bird',
      word: 'Sunrise',
      label: 'Early Bird',
      detail: `${pct(p.morningShare)} of your spins were before 11am. Coffee and wax.`,
      strength: p.morningShare / 0.35,
    },
    {
      id: 'weekender',
      word: 'Weekend',
      label: 'Weekend Warrior',
      detail: `${pct(p.weekendShare)} of your spins landed on the weekend.`,
      strength: p.weekendShare / Math.max(0.5, p.weekendBaseline * 1.6),
    },
    {
      id: 'daily',
      word: 'Everyday',
      label: 'Daily Ritual',
      detail: `You dropped the needle on ${p.activeDays} of ${p.days} days.`,
      strength: p.days >= 7 ? p.activeDays / p.days / 0.6 : 0,
    },
  ];

  const what: Candidate[] = [
    {
      id: 'loyalist',
      word: 'Loyalist',
      label: 'Loyalist',
      detail: `Your #1 record took ${pct(p.topRecordShare)} of all your spins.`,
      tagline: 'When you love a record, you really love a record.',
      strength: p.linkedSpins >= 5 ? p.topRecordShare / 0.2 : 0,
    },
    {
      id: 'time-traveler',
      word: 'Time Traveler',
      label: 'Time Traveler',
      detail: `The typical record you played came out in ${p.medianYear}.`,
      tagline: 'Your turntable doubles as a time machine.',
      strength: p.medianYear ? (1985 - p.medianYear) / 10 : 0,
    },
    {
      id: 'trendsetter',
      word: 'Trendsetter',
      label: 'Fresh Pressings',
      detail: `On average your records were only ${p.averageAgeAtSpin} years old when you played them.`,
      tagline: 'New wax, first in line.',
      strength: p.averageAgeAtSpin !== undefined ? (6 - p.averageAgeAtSpin) / 3 : 0,
    },
    {
      id: 'purist',
      word: `${p.topFamily ?? 'Genre'} Purist`,
      label: `${p.topFamily ?? 'Genre'} Purist`,
      detail: `${pct(p.topFamilyShare)} of your spins were ${p.topFamily}.`,
      tagline: 'You know what you like and you play it loud.',
      strength: p.topFamily && p.topFamily !== 'Other' ? p.topFamilyShare / 0.6 : 0,
    },
    {
      id: 'genre-hopper',
      word: 'Genre Hopper',
      label: 'Genre Hopper',
      detail: `Your genre diversity score is ${Math.round(p.diversity * 100)}/100.`,
      tagline: 'No two crates look the same in your house.',
      strength: p.diversity / 0.75,
    },
    {
      id: 'crate-digger',
      word: 'Crate Digger',
      label: 'Crate Digger',
      detail: `${p.uniqueRecords} different records across ${p.linkedSpins} spins.`,
      tagline: 'Always flipping through one more crate.',
      strength: p.uniqueRecords >= 8 ? p.uniqueRecords / Math.max(1, p.linkedSpins) / 0.6 : 0,
    },
    {
      id: 'explorer',
      word: 'Explorer',
      label: 'Explorer',
      detail: `You spun ${p.discoveries} records for the very first time.`,
      tagline: 'Every week, a new sleeve on the shelf.',
      strength: p.discoveries / 8,
    },
    {
      id: 'marathoner',
      word: 'Marathoner',
      label: 'Marathon Listener',
      detail: `Your longest session ran ${p.longestSessionSpins} records back to back.`,
      tagline: 'One more side. Then another. Then another.',
      strength: p.longestSessionSpins / 5,
    },
  ];

  const best = (list: Candidate[]) => [...list].sort((a, b) => b.strength - a.strength)[0];
  const adjective = best(when);
  const noun = best(what);
  const traits = [...when, ...what]
    .filter((c) => c.strength >= 1)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4)
    .map(({ id, label, detail }) => ({ id, label, detail }));

  const adj = adjective.strength >= 1 ? adjective.word : 'Easygoing';
  const nn = noun.strength >= 1 ? noun.word : 'Selector';
  return {
    title: `The ${adj} ${nn}`,
    tagline: noun.strength >= 1 && noun.tagline ? noun.tagline : 'A little bit of everything, whenever the mood strikes.',
    traits,
  };
}
