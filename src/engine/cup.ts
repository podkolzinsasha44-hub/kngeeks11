// Knock-out competitions: the Russian Cup (single matches, the lower divisions start in August) and the
// promotion / relegation play-offs between neighbouring divisions (two legs).
import { LEAGUES, LEAGUE_IDS, leagueTeams } from './leagues';
import { pushNews } from './news';
import { shuffle } from './rng';
import { freeDay } from './schedule';
import { sortedTeams } from './standings';
import type { Cup, CupTie, Game, League, Team } from './types';
import { addDays, dow } from './util';

const onDow = (n: number) => (d: string) => { while (dow(d) !== n) d = addDays(d, 1); return d; };
const tue = onDow(2), wed = onDow(3);
const tierOf = (L: League, id: string) => (L.teams[id] ? LEAGUES[L.teams[id].lg].tier : 0);
/** The Premier League joins the cup in the last 32. */
const RPL_ROUND = 2;

/**
 * Russian Cup. The clubs of the Second League (divisions A and B) and the weakest of the First League start in
 * August, the rest of the First League joins in the second round, the Premier League in the last 32 — so that
 * 16 clubs of the lower divisions meet the 16 of the RPL there. Single matches at the club of the lower division.
 * A model of the real format (the "regions path" of the lower leagues and the RPL path).
 */
export function initCup(L: League, season: number) {
  const rpl = leagueTeams(L, 'RPL').map((t) => t.id);
  const fnl = leagueTeams(L, 'FNL').sort((a, b) => b.rep - a.rep).map((t) => t.id);
  const lower = (['L2A', 'L2B'] as const).flatMap((lg) => leagueTeams(L, lg).map((t) => t.id));
  const cup: Cup = {
    id: 'CUP', name: 'Кубок России', season,
    rounds: [
      { name: '1-й раунд', day: tue(`${season}-08-11`) }, { name: '2-й раунд', day: tue(`${season}-08-25`) },
      { name: '1/16 финала', day: wed(`${season}-09-22`) }, { name: '1/8 финала', day: wed(`${season}-10-27`) },
      { name: '1/4 финала', day: wed(`${season + 1}-03-09`) }, { name: '1/2 финала', day: wed(`${season + 1}-04-20`) },
      { name: 'Финал', day: `${season + 1}-06-09` },
    ],
    round: 0, ties: [],
  };
  L.cups.CUP = cup;
  // Round 2 has 32 places: the winners of round 1 and the First League clubs that start there.
  // With k First League clubs in round 1: (lower + k) / 2 + (fnl - k) = 32.
  const k = lower.length + 2 * fnl.length - 64;
  if (lower.length && k >= 0 && k <= fnl.length && (lower.length + k) % 2 === 0) {
    cup.enter = { 1: fnl.slice(0, fnl.length - k), [RPL_ROUND]: rpl };
    drawRound(L, cup, 0, [...lower, ...fnl.slice(fnl.length - k)]);
    return;
  }
  // Without the lower divisions: the RPL against the 16 best-known clubs of the First League.
  cup.round = RPL_ROUND;
  cup.enter = { [RPL_ROUND]: rpl };
  drawRound(L, cup, RPL_ROUND, fnl.slice(0, rpl.length));
}

/** Draw of a round: the clubs joining now meet the winners of the previous round, the rest are paired among
 *  themselves. The club of the lower division plays at home. */
function drawRound(L: League, cup: Cup, round: number, winners: string[]) {
  const ent = shuffle([...(cup.enter?.[round] ?? [])]), won = shuffle([...winners]);
  const pairs: [string, string][] = [];
  while (ent.length && won.length) pairs.push([ent.pop()!, won.pop()!]);
  const rest = shuffle([...ent, ...won]);
  for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
  for (const [a, b] of pairs) {
    const [h, aw] = tierOf(L, a) > tierOf(L, b) ? [a, b] : [b, a];
    addTie(L, cup, round, h, aw);
  }
}

function addTie(L: League, cup: Cup, round: number, h: string, a: string, legs = 1) {
  const tie: CupTie = { id: `${cup.id}${cup.season}-${round}-${cup.ties.filter((t) => t.round === round).length}`, round, h, a, games: [] };
  const day = cup.rounds[round].day;
  const final = cup.id === 'CUP' && round === cup.rounds.length - 1;
  for (let leg = 0; leg < legs; leg++) {
    // A single cup match moves a day if one of the clubs has a league game around it.
    const g: Game = { id: L.nextGameId++, comp: cup.id, day: legs === 1 && !final ? freeDay(L, h, a, day) : addDays(day, leg * 4), h: leg ? a : h, a: leg ? h : a, rd: cup.rounds[round].name, tie: tie.id, ...(final ? { neutral: true } : {}) };
    L.games.push(g);
    tie.games.push(g.id);
  }
  cup.ties.push(tie);
  return tie;
}

/** First-leg score from the point of view of the second leg's home and away sides. */
export function aggregateFor(L: League, g: Game): [number, number] | undefined {
  if (!g.tie) return undefined;
  const cup = L.cups[g.comp];
  const tie = cup?.ties.find((t) => t.id === g.tie);
  if (!tie || tie.games.length < 2 || tie.games[1] !== g.id) return undefined;
  const first = L.games.find((x) => x.id === tie.games[0]);
  return first?.played ? [first.as!, first.hs!] : undefined;
}

/** Is this the deciding game of its tie (extra time and penalties when level)? */
export function isDecider(L: League, g: Game) {
  if (!g.tie) return false;
  const tie = L.cups[g.comp]?.ties.find((t) => t.id === g.tie);
  return !!tie && tie.games[tie.games.length - 1] === g.id;
}

/** Updates the bracket after a cup game. Returns 'final' when the trophy has been won. */
export function onCupGame(L: League, g: Game): 'final' | 'tie' | null {
  const cup = L.cups[g.comp];
  const tie = cup?.ties.find((t) => t.id === g.tie);
  if (!cup || !tie || tie.games[tie.games.length - 1] !== g.id) return null;
  let hs = g.hs!, as = g.as!;
  const agg = aggregateFor(L, g);
  if (agg) { hs += agg[0]; as += agg[1]; }
  const homeWon = hs !== as ? hs > as : (g.pen?.[0] ?? 0) > (g.pen?.[1] ?? 0);
  tie.winner = homeWon ? g.h : g.a;
  const loser = homeWon ? g.a : g.h;
  const done = cup.ties.filter((t) => t.round === tie.round).every((t) => t.winner);
  if (!done) return 'tie';
  if (tie.round === cup.rounds.length - 1) {
    if (cup.id === 'CUP') {
      cup.champion = tie.winner;
      cup.finalist = loser;
      const t = L.teams[tie.winner];
      t.cups++;
      t.trophies.push(`Кубок России ${cup.season}/${String((cup.season + 1) % 100).padStart(2, '0')}`);
      pushNews(L, { kind: 'award', title: `🏆 «${t.ru}» — обладатель Кубка России!`, team: t.id, important: true });
      return 'final';
    }
    return 'tie';
  }
  // Draw of the next round
  cup.round = tie.round + 1;
  drawRound(L, cup, cup.round, cup.ties.filter((t) => t.round === tie.round).map((t) => t.winner!));
  if (cup.id === 'CUP') pushNews(L, { kind: 'league', title: `Кубок России: жеребьёвка стадии «${cup.rounds[cup.round].name}» состоялась` });
  return 'tie';
}

/** Divisions whose seasons must be over before the play-offs start. */
export const PO_LEAGUES = LEAGUE_IDS.filter((lg) => LEAGUES[lg].playoff || LEAGUES[lg].promotePO);

/**
 * Play-offs between neighbouring divisions, two legs, the first at the club of the lower one: 13th and 14th of the
 * RPL against 4th and 3rd of the First League; 16th of the First League against 3rd of the Second League A.
 */
export function initPlayoffs(L: League, season: number) {
  const start = addDays(L.date, 3);
  const cup: Cup = { id: 'PO', name: 'Переходные матчи', season, rounds: [{ name: 'Переходные матчи', day: start }], round: 0, ties: [] };
  L.cups.PO = cup;
  const pairs: [Team, Team][] = [];
  for (const hi of LEAGUE_IDS) {
    const c = LEAGUES[hi], lo = c.down;
    if (!lo || !c.playoff) continue;
    const top = sortedTeams(L, hi), low = sortedTeams(L, lo);
    const from = LEAGUES[lo].promote ?? 0, n = Math.min(c.playoff, LEAGUES[lo].promotePO ?? 0);
    if (top.length < c.relegate + n || low.length < from + n) continue;
    // The higher a club of the upper division finished, the stronger its opponent: 13th meets 4th, 14th meets 3rd.
    for (let k = 0; k < n; k++) pairs.push([low[from + n - 1 - k], top[top.length - c.relegate - n + k]]);
  }
  for (const [lo, hi] of pairs) addTie(L, cup, 0, lo.id, hi.id, 2);
  if (pairs.length) pushNews(L, { kind: 'league', title: `Переходные матчи: ${pairs.map(([lo, hi]) => `«${hi.ru}» — «${lo.ru}»`).join(', ')}`, important: true });
}
