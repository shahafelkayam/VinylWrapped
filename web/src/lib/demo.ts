// A believable demo crate: real albums (covers from the Cover Art Archive) and ~20 months of
// generated listening with evening/weekend peaks, new-record binges, favorites and dusty corners.
import type { Library, Listen, VinylRecord } from '../../../shared/types.ts';
import { addDays, todayLocal, weekdayOf } from '../../../shared/time.ts';

type Row = [id: string, title: string, artist: string, rg: string, year: number, genres: string[], label: string, country: string, type: 'Person' | 'Group', minutes: number, discs?: number];

const CATALOG: Row[] = [
  ['kind-of-blue', 'Kind of Blue', 'Miles Davis', '8e8a594f-2175-38c7-a871-abb68ec363e7', 1959, ['cool jazz', 'modal jazz', 'jazz'], 'Columbia', 'US', 'Person', 46],
  ['a-love-supreme', 'A Love Supreme', 'John Coltrane', '77cf47ba-58cd-3f3d-a5f9-79bf89860421', 1965, ['spiritual jazz', 'avant-garde jazz', 'modal jazz'], 'Impulse!', 'US', 'Person', 33],
  ['blue-train', 'Blue Train', 'John Coltrane', 'a3703e2d-cb78-4217-87ed-02da8e3ed71d', 1957, ['hard bop', 'jazz'], 'Blue Note', 'US', 'Person', 42],
  ['abbey-road', 'Abbey Road', 'The Beatles', '9162580e-5df4-32de-80cc-f45a8d8a9b1d', 1969, ['rock', 'pop rock', 'psychedelic pop'], 'Apple Records', 'GB', 'Group', 47],
  ['rumours', 'Rumours', 'Fleetwood Mac', '416bb5e5-c7d1-3977-8fd7-7c9daf6c2be6', 1977, ['soft rock', 'pop rock'], 'Warner Bros. Records', 'GB', 'Group', 39],
  ['dark-side-of-the-moon', 'The Dark Side of the Moon', 'Pink Floyd', 'f5093c06-23e3-404f-aeaa-40f72885ee3a', 1973, ['progressive rock', 'art rock', 'psychedelic rock'], 'Harvest', 'GB', 'Group', 43],
  ['whats-going-on', 'What’s Going On', 'Marvin Gaye', 'c1fa4d2c-ec62-37d5-b01d-6df7f8fd2c90', 1971, ['soul', 'psychedelic soul'], 'Tamla', 'US', 'Person', 35],
  ['songs-in-the-key-of-life', 'Songs in the Key of Life', 'Stevie Wonder', 'ea88b09b-fd34-33cf-a3e5-25a3a2fb4c6f', 1976, ['soul', 'funk', 'pop soul'], 'Tamla', 'US', 'Person', 105, 2],
  ['blue', 'Blue', 'Joni Mitchell', '42d725fb-a8b7-388c-8866-3b02789af326', 1971, ['folk', 'singer-songwriter', 'folk pop'], 'Reprise', 'CA', 'Person', 36],
  ['pet-sounds', 'Pet Sounds', 'The Beach Boys', 'fdd96703-7b21-365e-bdea-38029fbeb84e', 1966, ['baroque pop', 'psychedelic pop', 'sunshine pop'], 'Capitol', 'US', 'Group', 36],
  ['unknown-pleasures', 'Unknown Pleasures', 'Joy Division', '42352def-1aab-3000-b548-895ebd869cb6', 1979, ['post-punk', 'gothic rock'], 'Factory', 'GB', 'Group', 39],
  ['london-calling', 'London Calling', 'The Clash', '8d73e45e-7ca1-3cb4-ae28-6da76196c17c', 1979, ['punk rock', 'post-punk', 'reggae rock'], 'CBS', 'GB', 'Group', 65, 2],
  ['remain-in-light', 'Remain in Light', 'Talking Heads', 'f6b1b900-6108-32f0-abbd-2855af9151eb', 1980, ['new wave', 'art punk', 'afrobeat'], 'Sire', 'US', 'Group', 40],
  ['purple-rain', 'Purple Rain', 'Prince and The Revolution', 'b93a7c47-a6d4-33f2-9034-53fdd991f4ba', 1984, ['pop rock', 'minneapolis sound', 'funk rock'], 'Warner Bros. Records', 'US', 'Group', 44],
  ['thriller', 'Thriller', 'Michael Jackson', 'f32fab67-77dd-3937-addc-9062e28e4c37', 1982, ['pop', 'r&b', 'disco'], 'Epic', 'US', 'Person', 42],
  ['discovery', 'Discovery', 'Daft Punk', '48117b90-a16e-34ca-a514-19c702df1158', 2001, ['french house', 'disco', 'electronic'], 'Virgin', 'FR', 'Group', 61, 2],
  ['homogenic', 'Homogenic', 'Björk', '810272e0-aef1-3d85-b2d3-e512e87fc38c', 1997, ['art pop', 'electronic', 'trip hop'], 'One Little Indian', 'IS', 'Person', 44],
  ['ok-computer', 'OK Computer', 'Radiohead', 'b1392450-e666-3926-a536-22c65f834433', 1997, ['alternative rock', 'art rock'], 'Parlophone', 'GB', 'Group', 53, 2],
  ['in-rainbows', 'In Rainbows', 'Radiohead', '6e335887-60ba-38f0-95af-fae7774336bf', 2007, ['art rock', 'alternative rock'], 'XL Recordings', 'GB', 'Group', 42],
  ['random-access-memories', 'Random Access Memories', 'Daft Punk', 'aa997ea0-2936-40bd-884d-3af8a0e064dc', 2013, ['disco', 'electronic', 'funk'], 'Columbia', 'FR', 'Group', 74, 2],
  ['to-pimp-a-butterfly', 'To Pimp a Butterfly', 'Kendrick Lamar', 'd9103c72-3807-4378-9ce7-b6f3e8fdd547', 2015, ['conscious hip hop', 'jazz rap', 'west coast hip hop'], 'Top Dawg Entertainment', 'US', 'Person', 79, 2],
  ['illmatic', 'Illmatic', 'Nas', '28298e2c-4d70-3eed-a0f5-a3280c662b3d', 1994, ['east coast hip hop', 'boom bap'], 'Columbia', 'US', 'Person', 40],
  ['miseducation', 'The Miseducation of Lauryn Hill', 'Lauryn Hill', '8691d12c-abd8-385c-b1eb-d841190124f7', 1998, ['neo soul', 'hip hop', 'r&b'], 'Ruffhouse', 'US', 'Person', 77, 2],
  ['currents', 'Currents', 'Tame Impala', '08aa7a6c-3e43-4459-87b2-e47faf3a088a', 2015, ['psychedelic pop', 'neo-psychedelia', 'synth-pop'], 'Interscope', 'AU', 'Group', 51, 2],
  ['blonde', 'Blonde', 'Frank Ocean', '0da340a0-6ad7-4fc2-a272-6f94393a7831', 2016, ['alternative r&b', 'art pop'], 'Boys Don’t Cry', 'US', 'Person', 60, 2],
  ['buena-vista-social-club', 'Buena Vista Social Club', 'Buena Vista Social Club', '32bbab8e-02c0-30d2-9e23-a19739864b84', 1997, ['son cubano', 'bolero', 'latin'], 'World Circuit', 'CU', 'Group', 60, 2],
  ['getz-gilberto', 'Getz/Gilberto', 'Stan Getz & João Gilberto', 'b248d212-aace-3c3e-a23d-e13aaac1f87a', 1964, ['bossa nova', 'cool jazz'], 'Verve', 'US', 'Person', 34],
  ['zombie', 'Zombie', 'Fela Kuti & Afrika 70', '517cbfb2-2279-4af9-8ca7-1c4c1a444925', 1976, ['afrobeat'], 'Coconut', 'NG', 'Group', 25],
  ['exodus', 'Exodus', 'Bob Marley & The Wailers', 'c5650313-60f3-34d3-92e4-300545133792', 1977, ['roots reggae', 'reggae'], 'Island', 'JM', 'Group', 37],
  ['led-zeppelin-iv', 'Led Zeppelin IV', 'Led Zeppelin', '2e61da88-39e9-3473-81d2-c964cb394952', 1971, ['hard rock', 'blues rock', 'folk rock'], 'Atlantic', 'GB', 'Group', 42],
  ['paranoid', 'Paranoid', 'Black Sabbath', 'cc053745-c447-3566-8f27-bed5438c9133', 1970, ['heavy metal', 'hard rock'], 'Vertigo', 'GB', 'Group', 42],
  ['nevermind', 'Nevermind', 'Nirvana', '1b022e01-4da6-387b-8658-8678046e4cef', 1991, ['grunge', 'alternative rock'], 'DGC', 'US', 'Group', 49],
  ['back-to-black', 'Back to Black', 'Amy Winehouse', '6eac2e57-ee50-36f8-b0c4-c4c847a2c098', 2006, ['soul', 'neo soul', 'r&b'], 'Island', 'GB', 'Person', 35],
  ['blackstar', 'Blackstar', 'David Bowie', '1fd18f5b-9a92-41fd-a590-da6b5cc60d85', 2016, ['art rock', 'jazz rock', 'experimental rock'], 'Columbia', 'GB', 'Person', 41],
  ['hounds-of-love', 'Hounds of Love', 'Kate Bush', '017f2a37-a78f-3578-9611-fa40408e5d90', 1985, ['art pop', 'art rock'], 'EMI', 'GB', 'Person', 47],
  ['selected-ambient-works', 'Selected Ambient Works 85–92', 'Aphex Twin', '6842c81d-ea77-3dfd-abf7-4323add3f4d4', 1992, ['ambient techno', 'idm'], 'Apollo', 'GB', 'Person', 75, 2],
  ['goldberg-variations', 'The Goldberg Variations', 'Glenn Gould', 'dcff25f1-702d-3b5e-b0da-d48172e6e62a', 1956, ['baroque', 'classical'], 'Columbia Masterworks', 'CA', 'Person', 38],
  ['moon-safari', 'Moon Safari', 'Air', 'b0bf2b77-b8cf-32f6-8893-9741d757b400', 1998, ['downtempo', 'electronic', 'dream pop'], 'Source', 'FR', 'Group', 43],
  ['igor', 'IGOR', 'Tyler, The Creator', '0f1b9e07-b38b-4bba-9794-55e0924d7177', 2019, ['hip hop', 'neo soul', 'synth-funk'], 'Columbia', 'US', 'Person', 40],
  ['yemenite-songs', 'Yemenite Songs', 'Ofra Haza', '4f2c568a-fb10-4dba-8737-ca1dce285426', 1984, ['mizrahi', 'world', 'folk'], 'Hed Arzi', 'IL', 'Person', 37],
];

/** Small deterministic PRNG so the demo looks the same on every visit. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, rnd: () => number): T {
  const total = items.reduce((a, t) => a + weight(t), 0);
  let r = rnd() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

const pad = (n: number) => String(n).padStart(2, '0');

export function demoLibrary(today = todayLocal()): Library {
  const rnd = mulberry32(19690926);
  const days = 600;
  const start = addDays(today, -days);
  const offset = '+02:00';

  const records: Record<string, VinylRecord> = {};
  const love = new Map<string, number>();
  const added = new Map<string, string>();

  CATALOG.forEach(([id, title, artist, rg, year, genres, label, country, type, minutes, discs = 1], i) => {
    // The first 22 records were already in the crate; the rest arrive over time.
    const addedOn = i < 22 ? addDays(start, -Math.floor(rnd() * 400)) : addDays(start, Math.floor(40 + rnd() * (days - 60)));
    added.set(id, addedOn);
    love.set(id, i === 0 || id === 'currents' || id === 'blonde' ? 3.2 : id === 'goldberg-variations' || id === 'paranoid' ? 0.08 : 0.4 + rnd() * 1.8);
    records[id] = {
      id,
      title,
      artistCredit: artist,
      artists: [{ name: artist, type, country, genres: genres.slice(0, 2) }],
      year,
      label,
      format: discs > 1 ? `${discs}×12" Vinyl` : '12" Vinyl',
      discs,
      type: 'Album',
      genres,
      tags: [],
      tracks: [],
      durationMs: minutes * 60_000,
      coverUrl: `https://coverartarchive.org/release-group/${rg}/front-250`,
      releaseGroupMbid: rg,
      addedAt: `${addedOn}T12:00:00${offset}`,
    };
  });

  const listens: Listen[] = [];
  let seq = 0;
  for (let d = 0; d <= days; d++) {
    const date = addDays(start, d);
    const wd = weekdayOf(date);
    const weekend = wd >= 4; // Fri–Sun
    const season = 0.75 + 0.35 * Math.sin((d / 365) * 2 * Math.PI + 1.2);
    if (rnd() > (weekend ? 0.62 : 0.34) * season) continue;

    const available = CATALOG.map((r) => r[0]).filter((id) => added.get(id)! <= date);
    const sessionCount = 1 + (rnd() < (weekend ? 0.35 : 0.12) ? 1 : 0);
    for (let s = 0; s < sessionCount; s++) {
      const r = rnd();
      // Mostly evenings, some weekend mornings, a few late nights.
      let minute =
        r < 0.62 ? (19 + rnd() * 3.5) * 60 : r < 0.8 && weekend ? (8.5 + rnd() * 3) * 60 : r < 0.92 ? (13 + rnd() * 5) * 60 : (22.6 + rnd() * 1.3) * 60;
      const spins = 1 + Math.floor(rnd() * rnd() * 4);
      for (let k = 0; k < spins && minute < 24 * 60; k++) {
        const id = pickWeighted(
          available,
          (id) => {
            const age = Number(new Date(`${date}T00:00:00Z`)) - Number(new Date(`${added.get(id)}T00:00:00Z`));
            const fresh = age < 21 * 86_400_000 ? 4 : 1;
            return love.get(id)! * fresh;
          },
          rnd,
        );
        listens.push({
          id: `demo${(seq++).toString(36)}`,
          record: id,
          at: `${date}T${pad(Math.floor(minute / 60))}:${pad(Math.floor(minute % 60))}:00${offset}`,
          source: rnd() < 0.85 ? 'nfc' : 'web',
        });
        minute += records[id].durationMs! / 60_000 + 3 + rnd() * 20;
      }
    }
  }

  // A tag that was scanned but never linked to a record.
  listens.push({ id: 'demo-unlinked', record: 'tag-07', at: `${addDays(today, -2)}T21:40:00${offset}`, source: 'nfc' });
  listens.sort((a, b) => a.at.localeCompare(b.at));
  return { records, listens };
}
