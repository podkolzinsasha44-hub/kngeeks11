import { leagueTeams } from './leagues';
import type { League, LeagueId, Record_, Team } from './types';

export const emptyRecord = (): Record_ => ({ gp: 0, w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0, hw: 0, hd: 0, hl: 0, streak: '', l5: [], sf: 0, sa: 0 });

/** Head-to-head points and goal difference between two clubs in the league games played so far. */
function h2h(L: League, a: Team, b: Team) {
  let pa = 0, pb = 0, gd = 0;
  for (const g of L.games) {
    if (!g.played || g.comp !== a.lg) continue;
    const ab = g.h === a.id && g.a === b.id, ba = g.h === b.id && g.a === a.id;
    if (!ab && !ba) continue;
    const ga = ab ? g.hs! : g.as!, gb = ab ? g.as! : g.hs!;
    gd += ga - gb;
    if (ga > gb) pa += 3; else if (ga < gb) pb += 3; else { pa++; pb++; }
  }
  return { pts: pa - pb, gd };
}

/** League order: points, wins, head-to-head (points, goal difference), goal difference, goals scored. */
export function compareTeams(L: League | null, a: Team, b: Team) {
  const ra = a.rec, rb = b.rec;
  if (ra.pts !== rb.pts) return rb.pts - ra.pts;
  if (ra.w !== rb.w) return rb.w - ra.w;
  if (L && ra.gp > 0) {
    const h = h2h(L, a, b);
    if (h.pts) return -h.pts;
    if (h.gd) return -h.gd;
  }
  const gda = ra.gf - ra.ga, gdb = rb.gf - rb.ga;
  if (gda !== gdb) return gdb - gda;
  if (ra.gf !== rb.gf) return rb.gf - ra.gf;
  return a.id < b.id ? -1 : 1;
}

export function sortedTeams(L: League, lg: LeagueId): Team[] {
  return leagueTeams(L, lg).sort((a, b) => compareTeams(L, a, b));
}

export function placeOf(L: League, teamId: string) {
  const t = L.teams[teamId];
  return sortedTeams(L, t.lg).findIndex((x) => x.id === teamId) + 1;
}

export function applyResult(t: Team, gf: number, ga: number, home: boolean, sf: number, sa: number) {
  const r = t.rec;
  r.gp++; r.gf += gf; r.ga += ga; r.sf += sf; r.sa += sa;
  const res: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  if (res === 'W') { r.w++; r.pts += 3; if (home) r.hw++; }
  else if (res === 'D') { r.d++; r.pts += 1; if (home) r.hd++; }
  else { r.l++; if (home) r.hl++; }
  r.l5.push(res);
  if (r.l5.length > 5) r.l5.shift();
  const m = r.streak.match(/^([WDL])(\d+)$/);
  r.streak = m && m[1] === res ? `${res}${Number(m[2]) + 1}` : `${res}1`;
}
