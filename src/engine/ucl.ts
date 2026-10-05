// UEFA Champions League, the format since 2024-25: 36 clubs in one league phase (eight matches,
// two opponents from every pot, one at home and one away), knock-out play-offs for places 9-24,
// a fixed bracket from the round of 16 (the better-ranked club hosts the second leg), a one-match final.
//
// 2026-27 is the real draw with its real dates (public/data/world.json, scripts/build-ucl.mjs).
// Later seasons are drawn by the same rules from the final tables of the simulated leagues; the
// clubs from the rest of Europe (Porto, PSV, Galatasaray…) live in L.ext with their real squads and
// play only here. Nothing in this file depends on which club the user manages.
import { aiLineup } from './ai';
import { wageFor } from './contracts';
import { genPlayer } from './gen';
import { LEAGUES, statKey } from './leagues';
import { emptyLineup, squad } from './lineup';
import { pushMsg, pushNews } from './news';
import { next, shuffle } from './rng';
import { emptyRecord } from './standings';
import { leaders } from './stats';
import type { Cup, CupTie, Game, League, LeagueId, Player, Team, UclRow } from './types';
import { addDays, ageOn, clamp, dispName, dow, money, seasonLabel } from './util';

export const UCL = 'UCL';

export interface ExtClub {
  id: string; name: string; ru: string; short: string; country: string; primary: string; secondary: string; tm?: number;
  stadium: string; cap: number; rep: number; coach: { name: string; rating: number };
}
export interface UclWorld {
  season: number; holder: string; final: string; pots: string[][]; ext: ExtClub[];
  /** League-phase fixtures: [matchday, date, home, away]. */
  md: [number, string, string, string][];
}

/** Any club by id: one of the simulated leagues or a Champions League guest. */
export const club = (L: League, id: string): Team => L.teams[id] ?? L.ext?.[id];
export const isExt = (L: League, id: string) => !L.teams[id] && !!L.ext?.[id];

/** Squad of a club; guests' players have no `team`, only the name of their club in `ext`. */
export function rosterOf(L: League, id: string): Player[] {
  if (L.teams[id]) return squad(L, id);
  const t = L.ext?.[id];
  if (!t) return [];
  const out: Player[] = [];
  for (const k in L.players) {
    const p = L.players[k];
    if (!p.team && p.st === 'ACT' && p.ext === t.name) out.push(p);
  }
  return out;
}

export function makeExt(e: ExtClub): Team {
  return {
    id: e.id, lg: 'EXT' as LeagueId, ext: true, name: e.name, ru: e.ru, city: '', short: e.short, country: e.country, primary: e.primary, secondary: e.secondary, accent: e.secondary,
    stadium: e.stadium, cap: e.cap, rep: e.rep, tactic: 'balanced', last: null, lineup: emptyLineup(), rec: emptyRecord(), strategy: 'contend',
    coach: { name: e.coach.name, rating: e.coach.rating, style: 'balanced', age: 50, wage: 0 }, fans: 60, rel: 50,
    staff: { med: 2, scouting: 2, academy: 2 }, titles: 0, cups: 0, budget: 0, wageBudget: 0, trophies: [], ...(e.tm ? { tm: e.tm } : {}),
  };
}

// ----- calendar ---------------------------------------------------------------------------------

/** The 2026-27 calendar (UEFA): the first day of every league-phase matchday, knock-out first legs, the final. */
const REF = {
  md: ['2026-09-08', '2026-10-13', '2026-10-20', '2026-11-03', '2026-11-24', '2026-12-08', '2027-01-19', '2027-01-27'],
  ko: ['2027-02-16', '2027-03-09', '2027-04-06', '2027-04-27'],
  final: '2027-06-05',
};
export const ROUNDS = ['Плей-офф', '1/8 финала', '1/4 финала', '1/2 финала', 'Финал'];
/** Prize money (EUR), the 2024-27 distribution of UEFA rounded. */
export const PRIZE = { start: 18.6e6, win: 2.1e6, draw: 0.7e6, place: 275_000, ko: [1e6, 11e6, 12.5e6, 15e6, 18.5e6], champion: 6.5e6 };

/** The same date of another season, moved to the same day of the week. */
function shift(ref: string, season: number) {
  const years = season - 2026;
  if (!years) return ref;
  const d0 = `${Number(ref.slice(0, 4)) + years}${ref.slice(4)}`;
  for (const k of [0, 1, -1, 2, -2, 3, -3]) if (dow(addDays(d0, k)) === dow(ref)) return addDays(d0, k);
  return d0;
}
export const uclCalendar = (season: number) => ({ md: REF.md.map((d) => shift(d, season)), ko: REF.ko.map((d) => shift(d, season)), final: shift(REF.final, season) });

const busy = (L: League, id: string, d: string) => L.games.some((g) => g.day === d && (g.h === id || g.a === id));
/** A day for a match of two clubs: the planned one unless either club plays the day before, on it or after. */
function freeDay(L: League, h: string, a: string, day: string) {
  for (const k of [0, 1, -1, 2]) {
    const d = addDays(day, k);
    if (![h, a].some((id) => busy(L, id, addDays(d, -1)) || busy(L, id, d) || busy(L, id, addDays(d, 1)))) return d;
  }
  return day;
}

// ----- the season -------------------------------------------------------------------------------

const row = (): UclRow => ({ gp: 0, w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0, agf: 0, aw: 0 });
const pay = (L: League, id: string, sum: number) => { if (L.teams[id]) L.teams[id].budget += sum; };

function start(L: League, season: number, pots: string[][], holder: string, final: string, fill = true) {
  const prev = L.ucl;
  const ids = pots.flat();
  L.ucl = { season, pots, table: Object.fromEntries(ids.map((id) => [id, row()])), phase: 'league', holder, final, history: prev?.history ?? [] };
  const cal = uclCalendar(season);
  const cup: Cup = { id: UCL, name: 'Лига чемпионов', season, rounds: ROUNDS.map((name, i) => ({ name, day: i < 4 ? cal.ko[i] : cal.final })), round: 0, ties: [] };
  L.cups[UCL] = cup;
  refreshGuests(L, ids, fill);
  for (const id of ids) pay(L, id, PRIZE.start);
  if (ids.includes(L.user)) {
    const me = L.user;
    const opp = L.games.filter((g) => g.comp === UCL && (g.h === me || g.a === me)).sort((a, b) => (a.day < b.day ? -1 : 1));
    pushMsg(L, {
      from: 'Спортивный отдел', kind: 'league', title: `Лига чемпионов ${seasonLabel(season)}: соперники по общему этапу`,
      body: `${opp.map((g) => `${g.day.slice(8)}.${g.day.slice(5, 7)} — ${g.h === me ? `дома с «${club(L, g.a).ru}»` : `в гостях у «${club(L, g.h).ru}»`}`).join('\n')}\n\nЗа участие клуб получает ${money(PRIZE.start)}, за каждую победу — ${money(PRIZE.win)}. Первые 8 команд выходят в 1/8 финала, 9–24-е играют стыковые матчи.`,
      ref: { type: 'screen', id: 'ucl' },
    });
  }
  pushNews(L, { kind: 'league', title: `Лига чемпионов ${seasonLabel(season)}: определились соперники общего этапа`, important: ids.includes(L.user) });
}

/** The real 2026-27 draw from the data snapshot (new careers, and old saves before the first matchday). */
export function initUclFromWorld(L: League, w: UclWorld) {
  L.ext = Object.fromEntries(w.ext.map((e) => [e.id, makeExt(e)]));
  for (const [md, day, h, a] of w.md) L.games.push({ id: L.nextGameId++, comp: UCL, day: freeDay(L, h, a, day), h, a, rd: md });
  // The squads of the snapshot are used as they are: everyone at the start of a career is real.
  start(L, w.season, w.pots, w.holder, w.final, false);
}

/** Qualified clubs of a new season from the final tables: places in the leagues, the holder, the guests. */
export function qualifiers(L: League, holder: string | undefined): string[] {
  const QUOTA: [LeagueId, number][] = [['EPL', 5], ['ESP', 5], ['ITA', 4], ['GER', 4], ['FRA', 3]];
  // Russian clubs are suspended by UEFA since 2022; the setting brings the RPL champion back.
  if (L.settings.intlRussia) QUOTA.push(['RPL', 1]);
  const inn = new Set<string>();
  for (const [lg, n] of QUOTA) {
    for (const t of Object.values(L.teams)) if (t.last?.lg === lg && t.last.pos <= n) inn.add(t.id);
  }
  const hl = holder ? club(L, holder)?.lg : null;
  if (holder && hl && hl !== 'FNL' && hl !== 'L2B' && (hl !== 'RPL' || L.settings.intlRussia)) inn.add(holder);
  // The rest of Europe: the guests by strength (a little luck decides between close clubs).
  const guests = Object.values(L.ext ?? {}).filter((t) => !inn.has(t.id)).map((t) => ({ t, k: t.rep + next() * 8 })).sort((a, b) => b.k - a.k);
  for (const { t } of guests) { if (inn.size >= 36) break; inn.add(t.id); }
  // Not enough guests (never with the real data): the next places of the big leagues.
  for (let pos = 6; inn.size < 36 && pos <= 10; pos++) {
    for (const t of Object.values(L.teams)) if (inn.size < 36 && t.last && ['EPL', 'ESP', 'ITA', 'GER', 'FRA'].includes(t.last.lg) && t.last.pos === pos) inn.add(t.id);
  }
  return [...inn];
}

/** A new season drawn by the rules (called at the yearly rollover). */
export function initUclSeason(L: League, season: number) {
  if (!L.ext) return;
  const holder = L.ucl?.champion;
  const ids = qualifiers(L, holder);
  if (ids.length < 36) return;
  // Pots by strength (the reputation stands in for the UEFA coefficient); the holder heads pot 1.
  const order = ids.filter((id) => id !== holder).sort((a, b) => club(L, b).rep - club(L, a).rep || (a < b ? -1 : 1));
  if (holder && ids.includes(holder)) order.unshift(holder);
  const pots = makePots(order, (id) => club(L, id).country);
  const pairs = drawLeague(pots, (id) => club(L, id).country);
  const days = pairs && matchdays(pairs, ids);
  if (!pairs || !days) return;
  const cal = uclCalendar(season);
  const byMd = new Map<number, [string, string][]>();
  pairs.forEach((p, i) => (byMd.get(days[i]) ?? byMd.set(days[i], []).get(days[i])!).push(p));
  for (let md = 0; md < 8; md++) {
    (byMd.get(md) ?? []).forEach(([h, a], i) => {
      // Two days per matchday (the last one is played on a single evening).
      const day = md === 7 ? addDays(cal.md[md], 1) : addDays(cal.md[md], i % 2);
      L.games.push({ id: L.nextGameId++, comp: UCL, day: freeDay(L, h, a, day), h, a, rd: md + 1 });
    });
  }
  start(L, season, pots, holder ?? '', 'Финал');
}

/** Four pots of nine in order of strength; no pot gets more than three clubs of one country (else no valid draw exists). */
export function makePots(order: string[], country: (id: string) => string): string[][] {
  const left = [...order];
  return [0, 1, 2, 3].map((i) => {
    const pot: string[] = [];
    for (let k = 0; k < left.length && pot.length < 9; ) {
      if (i < 3 && pot.filter((id) => country(id) === country(left[k])).length >= 3) { k++; continue; }
      pot.push(left.splice(k, 1)[0]);
    }
    return pot;
  });
}

/**
 * League-phase draw: two opponents from every pot (one at home, one away), never a club of the same
 * country and at most two of any other country. Random draws with restarts, as UEFA's software does.
 */
export function drawLeague(pots: string[][], country: (id: string) => string): [string, string][] | null {
  for (let attempt = 0; attempt < 500; attempt++) {
    const games: [string, string][] = [];
    let cnt = new Map<string, number>();
    const met = new Set<string>();
    const k = (id: string, c: string) => `${id}|${c}`;
    const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const bump = (m: Map<string, number>, a: string, b: string) => {
      m.set(k(a, country(b)), (m.get(k(a, country(b))) ?? 0) + 1);
      m.set(k(b, country(a)), (m.get(k(b, country(a))) ?? 0) + 1);
    };
    /** A random bijection from `from` to `to` that respects the rules; country counts are committed on success. */
    const assign = (from: string[], to: string[], same: boolean): Map<string, string> | null => {
      for (let t = 0; t < 60; t++) {
        const m = new Map<string, string>(), used = new Set<string>(), c = new Map(cnt);
        const ok = (a: string, b: string) => country(a) !== country(b) && (c.get(k(a, country(b))) ?? 0) < 2 && (c.get(k(b, country(a))) ?? 0) < 2;
        let fail = false;
        // Within a pot there are no 2-cycles: every club meets two different opponents.
        const options = (a: string) => to.filter((b) => !used.has(b) && b !== a && !met.has(pair(a, b)) && ok(a, b) && (!same || m.get(b) !== a));
        const left = shuffle([...from]);
        while (left.length) {
          // The most constrained club is drawn first.
          let bi = 0, bo = options(left[0]);
          for (let i = 1; i < left.length && bo.length > 1; i++) {
            const o = options(left[i]);
            if (o.length < bo.length) { bi = i; bo = o; }
          }
          if (!bo.length) { fail = true; break; }
          const a = left.splice(bi, 1)[0];
          const b = bo[Math.floor(next() * bo.length)];
          m.set(a, b); used.add(b); bump(c, a, b);
        }
        if (!fail) { cnt = c; for (const [a, b] of m) met.add(pair(a, b)); return m; }
      }
      return null;
    };
    let fail = false;
    const order = shuffle([0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].filter((j) => j >= i).map((j) => [i, j] as [number, number])));
    for (const [i, j] of order) {
      if (i === j) {
        // Within a pot: a permutation without fixed points or 2-cycles; every club hosts one and visits one.
        const sigma = assign(pots[i], pots[i], true);
        if (!sigma) { fail = true; break; }
        for (const [a, b] of sigma) games.push([a, b]);
      } else {
        // Two bijections between the pots: the clubs of pot i host one opponent and visit another.
        const host = assign(pots[i], pots[j], false);
        const away = host && assign(pots[i], pots[j], false);
        if (!host || !away) { fail = true; break; }
        for (const [a, b] of host) games.push([a, b]);
        for (const [a, b] of away) games.push([b, a]);
      }
    }
    if (!fail && games.length === 144) return games;
  }
  return null;
}

/** Splits the 144 games into eight matchdays where every club plays once (edge colouring with Kempe chains). */
export function matchdays(games: [string, string][], ids: string[], C = 8): number[] | null {
  const n = games.length;
  for (let attempt = 0; attempt < 200; attempt++) {
    const col = new Array<number>(n).fill(-1);
    // at[club][colour] = game index
    const at = new Map<string, number[]>(ids.map((id) => [id, new Array<number>(C).fill(-1)]));
    const set = (e: number, c: number) => { col[e] = c; at.get(games[e][0])![c] = e; at.get(games[e][1])![c] = e; };
    const unset = (e: number) => { const c = col[e]; at.get(games[e][0])![c] = -1; at.get(games[e][1])![c] = -1; col[e] = -1; };
    const free = (id: string) => at.get(id)!.map((e, c) => (e < 0 ? c : -1)).filter((c) => c >= 0);
    let ok = true;
    for (const e of shuffle([...Array(n).keys()])) {
      const [u, v] = games[e];
      const fu = free(u), fv = free(v);
      const both = fu.filter((c) => fv.includes(c));
      if (both.length) { set(e, both[Math.floor(next() * both.length)]); continue; }
      let done = false;
      for (const a of shuffle(fu)) {
        for (const b of shuffle(fv)) {
          // Path from v alternating colours a, b, a…; swapping it frees colour a at v.
          const path: number[] = [];
          let x = v, c = a;
          for (;;) {
            const g = at.get(x)![c];
            if (g < 0) break;
            path.push(g);
            x = games[g][0] === x ? games[g][1] : games[g][0];
            c = c === a ? b : a;
          }
          if (path.some((g) => games[g].includes(u))) continue;
          const old = path.map((g) => col[g]);
          path.forEach(unset);
          path.forEach((g, i) => set(g, old[i] === a ? b : a));
          set(e, a);
          done = true;
          break;
        }
        if (done) break;
      }
      if (!done) { ok = false; break; }
    }
    if (ok) {
      const perm = shuffle([...Array(C).keys()]);
      return col.map((c) => perm[c]);
    }
  }
  return null;
}

/** Guests keep a full squad: free agents of their level sign, or a youngster comes up from the academy. */
export function refreshGuests(L: League, ids: string[], fill = true) {
  for (const id of ids) {
    const t = L.ext?.[id];
    if (!t) continue;
    let sq = rosterOf(L, id);
    const level = sq.map((p) => p.ovr).sort((a, b) => b - a).slice(0, 14).reduce((s, o, _, arr) => s + o / arr.length, 0) || 70;
    const need = (pos: Player['pos']) => (fill ? (pos === 'G' ? 2 : pos === 'D' ? 6 : pos === 'M' ? 6 : 4) : 0) - sq.filter((p) => p.pos === pos).length;
    for (const pos of ['G', 'D', 'M', 'F'] as const) {
      for (let i = need(pos); i > 0; i--) {
        const fa = Object.values(L.players).filter((p) => p.st === 'FA' && p.pos === pos && p.ovr <= level + 2 && ageOn(p.bd, L.date) <= 32).sort((a, b) => b.ovr - a.ovr)[0];
        const p = fa ?? genPlayer(L, { country: t.country, role: pos === 'G' ? 'GK' : pos === 'D' ? 'CB' : pos === 'M' ? 'CM' : 'ST', age: 18, ovr: clamp(Math.round(level - 14), 45, 66) });
        p.team = null; p.ext = t.name; p.st = 'ACT'; p.loan = undefined;
        p.c = { wage: Math.max(15_000, wageFor(p.ovr, null)), until: L.season + 2, signed: L.season };
        p.joined = L.season;
      }
      sq = rosterOf(L, id);
    }
    aiLineup(L, t, sq);
  }
}

// ----- results ----------------------------------------------------------------------------------

/** League-phase order: points, goal difference, goals, away goals, wins, away wins, strength. */
export function uclOrder(L: League): string[] {
  const u = L.ucl;
  if (!u) return [];
  return Object.keys(u.table).sort((a, b) => {
    const x = u.table[a], y = u.table[b];
    return y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || y.agf - x.agf || y.w - x.w || y.aw - x.aw || club(L, b).rep - club(L, a).rep || (a < b ? -1 : 1);
  });
}

function addTie(L: League, round: number, h: string, a: string, legs = 2) {
  const cup = L.cups[UCL];
  const n = cup.ties.filter((t) => t.round === round).length;
  const tie: CupTie = { id: `${UCL}${cup.season}-${round}-${n}`, round, h, a, games: [] };
  const day = addDays(cup.rounds[round].day, legs === 2 ? n % 2 : 0);
  for (let leg = 0; leg < legs; leg++) {
    const hh = leg ? a : h, aa = leg ? h : a;
    const g: Game = { id: L.nextGameId++, comp: UCL, day: legs === 1 ? day : freeDay(L, hh, aa, addDays(day, leg * 7)), h: hh, a: aa, rd: cup.rounds[round].name, tie: tie.id, ...(legs === 1 ? { neutral: true } : {}) };
    L.games.push(g);
    tie.games.push(g.id);
  }
  cup.ties.push(tie);
  for (const id of [h, a]) pay(L, id, PRIZE.ko[round]);
  return tie;
}

/** The better-ranked club of the league phase plays the second leg at home. */
function seeded(L: League, a: string, b: string): [string, string] {
  const o = L.ucl!.order!;
  return o.indexOf(a) < o.indexOf(b) ? [b, a] : [a, b];
}

function endLeaguePhase(L: League) {
  const u = L.ucl!;
  const o = uclOrder(L);
  u.order = o;
  u.phase = 'ko';
  o.forEach((id, i) => pay(L, id, (36 - i) * PRIZE.place));
  const plan: [string, string][][] = [[], []];
  // Play-offs: 9/10 v 23/24, 11/12 v 21/22, 13/14 v 19/20, 15/16 v 17/18; their winners meet 7/8, 5/6, 3/4 and 1/2.
  const groups = [0, 1, 2, 3].map((k) => {
    const s = shuffle([o[8 + 2 * k], o[9 + 2 * k]]), uns = shuffle([o[22 - 2 * k], o[23 - 2 * k]]);
    const ties = [addTie(L, 0, uns[0], s[0]), addTie(L, 0, uns[1], s[1])];
    const top = shuffle([o[6 - 2 * k], o[7 - 2 * k]]);
    return top.map((seed, h) => [seed, ties[h].id] as [string, string]);
  });
  // Bracket order of each half: 1/2, 7/8, 3/4, 5/6 (the 1/2 and 7/8 paths meet in the quarter-final).
  for (const h of [0, 1]) for (const k of [3, 0, 2, 1]) plan[h].push(groups[k][h]);
  u.plan = [...plan[0], ...plan[1]];
  const place = o.indexOf(L.user) + 1;
  if (place) {
    const text = place <= 8 ? 'выходим напрямую в 1/8 финала' : place <= 24 ? 'играем стыковые матчи за выход в 1/8 финала' : 'турнир для нас окончен';
    pushMsg(L, { from: 'Спортивный отдел', kind: 'league', title: `Лига чемпионов: ${place}-е место в общем этапе`, body: `Итог общего этапа — ${place}-е место: ${text}. Призовые за место — ${money((37 - place) * PRIZE.place)}.`, ref: { type: 'screen', id: 'ucl' } });
  }
  pushNews(L, { kind: 'league', title: `Лига чемпионов: общий этап завершён, первое место — «${club(L, o[0]).ru}»`, important: !!place });
}

function nextRound(L: League, round: number) {
  const u = L.ucl!, cup = L.cups[UCL];
  const won = (r: number) => cup.ties.filter((t) => t.round === r).map((t) => t.winner!);
  cup.round = round;
  if (round === 1) {
    for (const [seed, po] of u.plan!) addTie(L, 1, cup.ties.find((t) => t.id === po)!.winner!, seed);
  } else if (round <= 3) {
    const w = won(round - 1);
    for (let i = 0; i + 1 < w.length; i += 2) addTie(L, round, ...seeded(L, w[i], w[i + 1]));
  } else {
    const w = won(3);
    addTie(L, 4, w[0], w[1], 1);
  }
  const mine = cup.ties.find((t) => t.round === round && (t.h === L.user || t.a === L.user));
  if (mine) {
    const opp = club(L, mine.h === L.user ? mine.a : mine.h);
    pushMsg(L, { from: 'Спортивный отдел', kind: 'league', title: `Лига чемпионов, ${ROUNDS[round]}: «${opp.ru}»`, body: `${round === 4 ? `Финал — ${cup.rounds[4].day.split('-').reverse().join('.')}, ${u.final}.` : `Первый матч — ${L.games.find((g) => g.id === mine.games[0])!.day.split('-').reverse().join('.')}, ответный — через неделю.`} За выход в эту стадию клуб получил ${money(PRIZE.ko[round])}.`, ref: { type: 'screen', id: 'ucl' } });
  }
}

/** Updates the league phase or the bracket after a Champions League game. Returns 'final' when the cup is won. */
export function onUclGame(L: League, g: Game): 'final' | null {
  const u = L.ucl;
  if (!u) return null;
  if (!g.tie) {
    const h = u.table[g.h], a = u.table[g.a];
    if (!h || !a) return null;
    const hs = g.hs!, as = g.as!;
    h.gp++; a.gp++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs; a.agf += as;
    if (hs > as) { h.w++; h.pts += 3; a.l++; pay(L, g.h, PRIZE.win); }
    else if (hs < as) { a.w++; a.aw++; a.pts += 3; h.l++; pay(L, g.a, PRIZE.win); }
    else { h.d++; a.d++; h.pts++; a.pts++; pay(L, g.h, PRIZE.draw); pay(L, g.a, PRIZE.draw); }
    if (u.phase === 'league' && !L.games.some((x) => x.comp === UCL && !x.tie && !x.played)) endLeaguePhase(L);
    return null;
  }
  const cup = L.cups[UCL];
  const tie = cup?.ties.find((t) => t.id === g.tie);
  if (!tie || tie.games[tie.games.length - 1] !== g.id) return null;
  let hs = g.hs!, as = g.as!;
  if (tie.games.length === 2) {
    const first = L.games.find((x) => x.id === tie.games[0])!;
    hs += first.as!; as += first.hs!;
  }
  tie.winner = hs !== as ? (hs > as ? g.h : g.a) : (g.pen?.[0] ?? 0) > (g.pen?.[1] ?? 0) ? g.h : g.a;
  const loser = tie.winner === g.h ? g.a : g.h;
  if (loser === L.user) pushMsg(L, { from: 'Спортивный отдел', kind: 'league', title: `Лига чемпионов: вылет (${ROUNDS[tie.round]})`, body: `«${club(L, tie.winner).ru}» оказался сильнее. Еврокубковый сезон окончен.` });
  if (!cup.ties.filter((t) => t.round === tie.round).every((t) => t.winner)) return null;
  if (tie.round < 4) { nextRound(L, tie.round + 1); return null; }
  // The final.
  const w = club(L, tie.winner);
  cup.champion = u.champion = tie.winner;
  cup.finalist = u.finalist = loser;
  u.phase = 'done';
  pay(L, tie.winner, PRIZE.champion);
  w.trophies.push(`Лига чемпионов ${seasonLabel(u.season)}`);
  w.rep = clamp(w.rep + 3, 20, 97);
  club(L, loser).rep = clamp(club(L, loser).rep + 1, 20, 97);
  const top = leaders(L, statKey(u.season, UCL), 'g', 1)[0];
  if (top) top.p.awards.push(`${seasonLabel(u.season)} · ЛЧ: лучший бомбардир (${top.v})`);
  for (const p of rosterOf(L, tie.winner)) if ((p.stats[statKey(u.season, UCL)]?.gp ?? 0) > 0) p.awards.push(`${seasonLabel(u.season)} · победитель Лиги чемпионов`);
  u.history.unshift({ season: u.season, champion: tie.winner, finalist: loser, topScorer: top ? { id: top.p.id, name: dispName(top.p), g: top.v } : undefined });
  pushNews(L, { kind: 'award', title: `🏆 «${w.ru}» — победитель Лиги чемпионов!`, team: L.teams[w.id] ? w.id : undefined, important: true });
  if (tie.winner === L.user) L.achievements.ucl = L.date;
  return 'final';
}

/** How far a club went in the current Champions League: null when it did not take part. */
export function uclStage(L: League, id: string): { round: number; text: string } | null {
  const u = L.ucl;
  if (!u || !(id in u.table)) return null;
  if (u.champion === id) return { round: 5, text: 'победа в Лиге чемпионов' };
  const ties = L.cups[UCL]?.ties.filter((t) => t.h === id || t.a === id) ?? [];
  const r = ties.length ? Math.max(...ties.map((t) => t.round)) : -1;
  if (r < 0) return { round: -1, text: u.phase === 'league' ? 'общий этап ЛЧ' : 'ЛЧ: вылет в общем этапе' };
  return { round: r, text: r === 4 ? 'финал Лиги чемпионов' : `ЛЧ: ${ROUNDS[r]}` };
}

/** Club of a player: his simulated club, or the Champions League guest he plays for. */
export const playerClub = (L: League, p: Player): Team | null => (p.team ? L.teams[p.team] : p.ext && L.ext ? Object.values(L.ext).find((t) => t.name === p.ext) ?? null : null);

/** "АПЛ · 5-й тур", "Лига чемпионов · 1/8 финала". */
export function gameLabel(g: Pick<Game, 'comp' | 'rd'>) {
  const rd = typeof g.rd === 'number' ? `${g.rd}-й тур` : g.rd ?? '';
  const name = LEAGUES[g.comp as LeagueId]?.short ?? compName(g.comp);
  return rd ? `${name} · ${rd}` : name;
}

export const compName = (comp: string) => (comp === UCL ? 'Лига чемпионов' : comp === 'CUP' ? 'Кубок России' : comp === 'PO' ? 'Переходные матчи' : comp);
