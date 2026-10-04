// Odds shown to the user. Nothing here is a separate "prediction model":
//  * matchOdds plays the real match engine many times with the two line-ups as they are now;
//  * seasonOdds uses the engine's own expected-goals formula for every remaining fixture.
// A change in the user's eleven therefore changes the odds exactly as it changes the matches.
import { LEAGUES, styleOf } from './leagues';
import { lineupOnPitch, teamStrength, type Strength } from './lineup';
import { expectedGoals, finishing, simulateMatch, type MatchOpts, type MatchSide } from './match';
import { getState, seedState, useState_ } from './rng';
import { compareTeams, sortedTeams } from './standings';
import type { League, LeagueId, Player, Team } from './types';
import { hash } from './util';

export const sideOf = (t: Team): MatchSide => ({ id: t.id, short: t.short, lineup: t.lineup, tactic: t.tactic, coach: t.coach.rating });

export interface Odds { h: number; d: number; a: number; xgH: number; xgA: number }

/** Win / draw / loss chances from `n` runs of the match engine with the current line-ups. */
export function matchOdds(players: Record<number, Player>, home: MatchSide, away: MatchSide, o: MatchOpts = {}, n = 300): Odds {
  const saved = getState();
  // A private random stream: looking at the odds never changes what happens in the league.
  useState_(seedState(hash(home.lineup.xi.join(',') + '|' + away.lineup.xi.join(',') + home.tactic + away.tactic)));
  let h = 0, d = 0, a = 0, xh = 0, xa = 0;
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(players, home, away, { ...o, detail: false, knockout: false }).result;
    if (r.hs > r.as) h++; else if (r.hs < r.as) a++; else d++;
    xh += r.hs; xa += r.as;
  }
  useState_(saved);
  return { h: h / n, d: d / n, a: a / n, xgH: xh / n, xgA: xa / n };
}

export function gameOdds(L: League, home: string, away: string, comp: string, n = 300): Odds {
  return matchOdds(L.players, sideOf(L.teams[home] ?? L.ext?.[home]), sideOf(L.teams[away] ?? L.ext?.[away]), { style: styleOf({ comp }) }, n);
}

export interface Rating { str: Strength; fin: number }
export function ratingOf(L: League, t: Team): Rating {
  return { str: teamStrength(L, t), fin: finishing(lineupOnPitch(L, t.lineup)) };
}

function poissonCdf(lambda: number) {
  const out: number[] = [];
  let p = Math.exp(-lambda), s = p;
  for (let k = 0; k < 9; k++) { out.push(s); p *= lambda / (k + 1); s += p; }
  return out;
}

/** Analytic chances from expected goals (two Poisson distributions, small in-match correction for draws). */
export function quickOdds(h: Rating, a: Rating, style?: { shot: number; fin: number }, neutral = false) {
  const [lh, la] = expectedGoals(h, a, { style, neutral });
  let ph = 0, pd = 0, pa = 0;
  let pi = Math.exp(-lh);
  for (let i = 0; i < 9; i++) {
    let pj = Math.exp(-la);
    for (let j = 0; j < 9; j++) {
      const p = pi * pj;
      if (i > j) ph += p; else if (i < j) pa += p; else pd += p;
      pj *= la / (j + 1);
    }
    pi *= lh / (i + 1);
  }
  const s = ph + pd + pa;
  return { h: ph / s, d: pd / s, a: pa / s, lh, la };
}

export interface SeasonOdds { title: number; top: number; down: number; pts: number; place: number }

let rs = 1;
const r = () => {
  rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
  return (rs >>> 0) / 4294967296;
};

/** Simulates the rest of a league season `n` times with the current line-ups of every club. */
export function seasonOdds(L: League, lg: LeagueId, n = 300): Record<string, SeasonOdds> {
  rs = (Date.parse(L.date) / 86400000) | 0 || 99;
  const teams = sortedTeams(L, lg);
  const cfg = LEAGUES[lg];
  const rt: Record<string, Rating> = {};
  for (const t of teams) rt[t.id] = ratingOf(L, t);
  const rem = L.games.filter((g) => g.comp === lg && !g.played).map((g) => {
    const [lh, la] = expectedGoals(rt[g.h], rt[g.a], { style: cfg.style });
    return { h: g.h, a: g.a, ch: poissonCdf(lh), ca: poissonCdf(la) };
  });
  const draw = (cdf: number[]) => { const u = r(); let k = 0; while (k < cdf.length && u > cdf[k]) k++; return k; };
  const res: Record<string, SeasonOdds> = {};
  for (const t of teams) res[t.id] = { title: 0, top: 0, down: 0, pts: 0, place: 0 };
  const nTeams = teams.length;
  const downFrom = nTeams - cfg.relegate - cfg.playoff;
  for (let s = 0; s < n; s++) {
    const pts: Record<string, number> = {}, gd: Record<string, number> = {};
    for (const t of teams) { pts[t.id] = t.rec.pts; gd[t.id] = t.rec.gf - t.rec.ga + r() * 0.5; }
    for (const g of rem) {
      const x = draw(g.ch), y = draw(g.ca);
      gd[g.h] += x - y; gd[g.a] += y - x;
      if (x > y) pts[g.h] += 3; else if (x < y) pts[g.a] += 3; else { pts[g.h]++; pts[g.a]++; }
    }
    const order = teams.map((t) => t.id).sort((a, b) => pts[b] - pts[a] || gd[b] - gd[a]);
    order.forEach((id, i) => {
      const o = res[id];
      o.pts += pts[id]; o.place += i + 1;
      if (i === 0) o.title++;
      if (i < cfg.top) o.top++;
      if (i >= downFrom && (cfg.relegate || cfg.playoff)) o.down++;
    });
  }
  for (const id in res) { const o = res[id]; o.title /= n; o.top /= n; o.down /= n; o.pts /= n; o.place /= n; }
  return res;
}

export { compareTeams };
