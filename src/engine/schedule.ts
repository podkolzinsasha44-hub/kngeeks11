// League calendars: a double round-robin spread over the weekends of the season
// (with midweek rounds when the season is too short), honouring the winter break.
import { leagueDates, leagueTeams } from './leagues';
import { shuffle } from './rng';
import type { Game, League, LeagueId } from './types';
import { addDays, dow } from './util';

const busy = (L: League, id: string, d: string) => L.games.some((g) => g.day === d && (g.h === id || g.a === id));
/** A day for a match of two clubs: the planned one unless either club plays the day before, on it or after. */
export function freeDay(L: League, h: string, a: string, day: string) {
  for (const k of [0, 1, -1, 2]) {
    const d = addDays(day, k);
    if (![h, a].some((id) => busy(L, id, addDays(d, -1)) || busy(L, id, d) || busy(L, id, addDays(d, 1)))) return d;
  }
  return day;
}

/** Circle method: n-1 rounds, every pair meets once; home/away alternates. */
export function roundRobin(ids: string[]): [string, string][][] {
  const t = [...ids];
  if (t.length % 2) t.push('');
  const n = t.length, rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (!a || !b) continue;
      // The fixed team alternates venue; the others alternate by round parity.
      round.push(i === 0 ? (r % 2 ? [b, a] : [a, b]) : (i + r) % 2 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    t.splice(1, 0, t.pop()!);
  }
  return rounds;
}

/** Match days of a league season: Saturdays first, then Wednesdays if there are not enough weekends. */
export function matchDays(lg: LeagueId, season: number, rounds: number, from?: string): string[] {
  const dates = leagueDates(lg, season);
  const { end, pause } = dates;
  const start = from && from > dates.start ? from : dates.start;
  const free = (d: string) => !pause || d < pause[0] || d > pause[1];
  const sats: string[] = [], weds: string[] = [];
  let d = start;
  while (dow(d) !== 6) d = addDays(d, 1);
  for (; d <= end; d = addDays(d, 7)) {
    if (free(d)) sats.push(d);
    const w = addDays(d, 4);
    if (w <= end && free(w) && free(addDays(w, 3))) weds.push(w);
  }
  // Midweek rounds are spread evenly over the season.
  const need = rounds - sats.length;
  const extra = new Set<string>();
  for (let i = 0; i < need && weds.length; i++) extra.add(weds[Math.min(weds.length - 1, Math.floor(((i + 0.5) * weds.length) / need))]);
  const days = [...sats, ...extra].sort();
  if (days.length <= rounds) return days;
  // More weekends than rounds: drop the surplus evenly (international breaks).
  const out: string[] = [];
  for (let i = 0; i < rounds; i++) out.push(days[Math.round((i * (days.length - 1)) / (rounds - 1))]);
  return out;
}

/** `from`: a league added to a running career starts later than its usual first round. */
export function scheduleLeague(L: League, lg: LeagueId, season: number, from?: string) {
  const ids = shuffle(leagueTeams(L, lg).map((t) => t.id).sort());
  if (ids.length < 2) { if (L.comps[lg]) L.comps[lg].phase = 'done'; return; }
  const first = roundRobin(ids);
  const second = first.map((r) => r.map(([h, a]) => [a, h] as [string, string]));
  const all = [...first, ...second];
  const days = matchDays(lg, season, all.length, from);
  all.forEach((round, r) => {
    const day = days[Math.min(r, days.length - 1)];
    round.forEach(([h, a], i) => {
      // Half of the round is played a day later (Saturday / Sunday).
      const g: Game = { id: L.nextGameId++, comp: lg, day: i % 2 && dow(day) === 6 ? addDays(day, 1) : day, h, a, rd: r + 1 };
      L.games.push(g);
    });
  });
  const c = L.comps[lg];
  c.seasonStart = days[0];
  c.seasonEnd = addDays(days[days.length - 1], 1);
  c.phase = 'preseason';
}
