// Development and ageing. Runs once per season at the rollover, for every player in the world.
import { focusKeys, trainingGrowth } from './club';
import { seasonTotal } from './stats';
import { next, normal } from './rng';
import type { KeeperAttrs, League, OutfieldAttrs, Player } from './types';
import { W_ROLE, ageOn, calcOvr, clamp } from './util';

/** Expected yearly change of the overall rating by age (before potential and playing time). */
function curve(age: number, keeper: boolean) {
  const a = keeper ? age - 2 : age;
  if (a <= 18) return 3.4;
  if (a <= 20) return 2.6;
  if (a <= 22) return 1.7;
  if (a <= 24) return 0.9;
  if (a <= 28) return 0.1;
  if (a <= 30) return -0.5;
  if (a <= 32) return -1.2;
  if (a <= 34) return -1.9;
  return -2.7;
}

export function developPlayer(L: League, p: Player, season: number): number {
  const age = ageOn(p.bd, L.date);
  const st = seasonTotal(p, season);
  const keeper = p.pos === 'G';
  let d = curve(age, keeper);
  const room = p.pot - p.ovr;
  if (d > 0) {
    // Growth needs room below the potential and minutes on the pitch.
    const played = clamp(st.min / (keeper ? 1800 : 1500), 0, 1.25);
    d *= clamp(room / 6, 0, 1.6) * (0.45 + 0.55 * played) * (1 + (p.pers.prof - 10) * 0.025);
    if (p.dev === 'E' && age <= 21) d *= 1.25;
    if (p.dev === 'L' && age <= 21) d *= 0.75;
    if (p.dev === 'L' && age >= 23 && age <= 27 && room > 0) d += 0.6;
  } else {
    d *= 1 - (p.pers.prof - 10) * 0.02;
    if (p.dev === 'E' && age >= 30) d *= 1.2;
  }
  // The club's training of the season: load, emphasis and the training ground (club.ts).
  d += trainingGrowth(L, p);
  p.trn = 0;
  d += normal(0, 0.9);
  // A strong season shows in the ratings; a season on the bench does not.
  if (st.gp >= 15) d += clamp((st.rt / st.gp / 10 - 6.7) * 0.9, -0.6, 0.9);
  const delta = clamp(Math.round(d), -5, 6);
  if (!delta) return 0;
  if (keeper) {
    const a = p.r as KeeperAttrs;
    for (const k of ['ref', 'pos', 'han', 'kic', 'con', 'men'] as const) {
      const w = k === 'ref' && delta < 0 ? 1.3 : k === 'con' || k === 'men' ? (delta < 0 ? 0.4 : 1.1) : 1;
      a[k] = clamp(Math.round(a[k] + delta * w + normal(0, 0.6)), 20, 99);
    }
  } else {
    const a = p.r as OutfieldAttrs;
    const w = W_ROLE[p.role as keyof typeof W_ROLE];
    const focus = focusKeys(L, p);
    for (const k of ['pac', 'sho', 'pas', 'dri', 'att', 'def', 'phy', 'hea'] as const) {
      // Ageing hits pace and stamina first; passing and reading of the game hold up.
      const ageW = delta < 0 ? (k === 'pac' ? 1.7 : k === 'pas' || k === 'att' ? 0.5 : k === 'def' ? 0.7 : 1) : (p.focus === k ? 1.5 : 1) * (focus.includes(k) ? 1.3 : 1);
      const share = (w[k] ?? 0) > 0.03 || delta < 0 ? 1 : 0.4;
      a[k] = clamp(Math.round(a[k] + delta * ageW * share + normal(0, 0.6)), 15, 99);
    }
    if (delta < 0) a.sta = clamp(a.sta - (age >= 32 ? 2 : 1), 30, 99);
    else if (age <= 23) a.sta = clamp(a.sta + 1, 30, 99);
    if (focus.includes('sta') && age <= 30) a.sta = clamp(a.sta + 1, 30, 99);
  }
  const before = p.ovr;
  p.ovr = calcOvr(p);
  if (p.ovr > p.pot) p.pot = p.ovr;
  if (age >= 29) p.pot = p.ovr;
  return p.ovr - before;
}

/** End-of-season development for everyone; returns the biggest movers of a club. */
export function developAll(L: League, season: number) {
  const movers: { p: Player; d: number }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    if (p.st === 'RET') continue;
    const d = developPlayer(L, p, season);
    p.hist.push([season, p.ovr]);
    if (p.hist.length > 12) p.hist.shift();
    p.yth = false;
    if (d && p.team === L.user) movers.push({ p, d });
  }
  return movers.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
}

/** Retirement: old players without a club, or simply at the end of the road. */
export function shouldRetire(L: League, p: Player) {
  const age = ageOn(p.bd, L.date);
  const lim = p.pos === 'G' ? 38 : 35;
  if (age < lim - 2) return false;
  if (!p.team && !p.ext && age >= lim - 1) return true;
  const pr = age >= lim + 3 ? 0.85 : age >= lim + 1 ? 0.5 : age >= lim ? 0.28 : 0.08;
  return next() < pr * (p.ovr >= 78 ? 0.5 : 1);
}
