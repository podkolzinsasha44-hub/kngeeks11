import { isLeague } from './leagues';
import type { League, Player, StatLine } from './types';

export const emptyLine = (): StatLine => ({ gp: 0, gs: 0, min: 0, g: 0, a: 0, sh: 0, yc: 0, rc: 0, mom: 0, rt: 0, cs: 0, ga: 0, sv: 0 });

export function line(p: Player, key: string): StatLine {
  let l = p.stats[key];
  if (!l) p.stats[key] = l = emptyLine();
  return l;
}

export const avgRating = (s: StatLine | undefined) => (s && s.gp ? s.rt / s.gp / 10 : 0);

/** Sum of all club competitions of a season. */
export function seasonTotal(p: Player, season: number): StatLine {
  const t = emptyLine();
  for (const k in p.stats) {
    if (!k.startsWith(`${season}:`)) continue;
    const comp = k.split(':')[1];
    if (comp === 'WC' || comp === 'EURO') continue;
    const s = p.stats[k];
    for (const f in t) (t as unknown as Record<string, number>)[f] += (s as unknown as Record<string, number>)[f];
  }
  return t;
}

/** Career totals in league games: real seasons before the game started plus in-game seasons. */
export function career(p: Player) {
  const c = { gp: 0, g: 0, a: 0 };
  for (const h of p.h ?? []) { c.gp += Number(h[2]) || 0; c.g += Number(h[3]) || 0; c.a += Number(h[4]) || 0; }
  for (const k in p.stats) {
    if (!isLeague(k.split(':')[1])) continue;
    c.gp += p.stats[k].gp; c.g += p.stats[k].g; c.a += p.stats[k].a;
  }
  return c;
}

export function leaders(L: League, key: string, stat: 'g' | 'a' | 'ga' | 'rt' | 'cs' | 'yc' | 'mom', n = 10, filter?: (p: Player) => boolean) {
  const out: { p: Player; v: number }[] = [];
  for (const id in L.players) {
    const p = L.players[id];
    const s = p.stats[key];
    if (!s || !s.gp) continue;
    if (filter && !filter(p)) continue;
    if (stat === 'cs' && p.pos !== 'G') continue;
    if (stat === 'rt' && s.gp < 5) continue;
    const v = stat === 'ga' ? s.g + s.a : stat === 'rt' ? s.rt / s.gp / 10 : s[stat];
    if (v > 0) out.push({ p, v });
  }
  return out.sort((a, b) => b.v - a.v || a.p.stats[key].min - b.p.stats[key].min).slice(0, n);
}
