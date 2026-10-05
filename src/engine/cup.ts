// Knock-out competitions: the Russian Cup (simplified to a 32-club single-match bracket) and the
// promotion / relegation play-offs between the Premier League and the First League (two legs).
import { LEAGUES, LEAGUE_IDS, leagueTeams } from './leagues';
import { pushNews } from './news';
import { shuffle } from './rng';
import { sortedTeams } from './standings';
import type { Cup, CupTie, Game, League, Team } from './types';
import { addDays, dow } from './util';

const wed = (d: string) => { while (dow(d) !== 3) d = addDays(d, 1); return d; };

export function initCup(L: League, season: number) {
  const rpl = leagueTeams(L, 'RPL').map((t) => t.id);
  const fnl = leagueTeams(L, 'FNL').sort((a, b) => b.rep - a.rep).slice(0, 16).map((t) => t.id);
  const cup: Cup = {
    id: 'CUP', name: 'Кубок России', season,
    rounds: [
      { name: '1/16 финала', day: wed(`${season}-09-22`) }, { name: '1/8 финала', day: wed(`${season}-10-27`) },
      { name: '1/4 финала', day: wed(`${season + 1}-03-09`) }, { name: '1/2 финала', day: wed(`${season + 1}-04-20`) },
      { name: 'Финал', day: `${season + 1}-06-09` },
    ],
    round: 0, ties: [],
  };
  L.cups.CUP = cup;
  // First round: Premier League clubs travel to First League clubs.
  const a = shuffle([...rpl]), b = shuffle([...fnl]);
  a.forEach((id, i) => addTie(L, cup, 0, b[i], id));
}

function addTie(L: League, cup: Cup, round: number, h: string, a: string, legs = 1) {
  const tie: CupTie = { id: `${cup.id}${cup.season}-${round}-${cup.ties.filter((t) => t.round === round).length}`, round, h, a, games: [] };
  const day = cup.rounds[round].day;
  const final = cup.id === 'CUP' && round === cup.rounds.length - 1;
  for (let leg = 0; leg < legs; leg++) {
    const g: Game = { id: L.nextGameId++, comp: cup.id, day: addDays(day, leg * 4), h: leg ? a : h, a: leg ? h : a, rd: cup.rounds[round].name, tie: tie.id, ...(final ? { neutral: true } : {}) };
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
  const winners = shuffle(cup.ties.filter((t) => t.round === tie.round).map((t) => t.winner!));
  for (let i = 0; i + 1 < winners.length; i += 2) addTie(L, cup, cup.round, winners[i], winners[i + 1]);
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
