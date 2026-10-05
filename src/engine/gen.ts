// Future players: academy graduates who join the clubs every summer. They are the only
// fictional footballers in the game — everyone present at the start of a career is real.
import { YOUTH } from './names';
import { int, next, normal, pick, weighted } from './rng';
import type { KeeperAttrs, League, OutfieldAttrs, Personality, Player, Role, Team } from './types';
import { MIN_VALUE, W_ROLE, calcOvr, clamp, posOfRole, roundMoney } from './util';
import { wageFor } from './contracts';
import { touchSquads } from './lineup';

export function personality(): Personality {
  const v = () => clamp(Math.round(normal(11, 3.5)), 1, 20);
  return { lead: v(), prof: v(), loy: v(), greed: v(), win: v() };
}
export const devType = (): Player['dev'] => (next() < 0.2 ? 'E' : next() < 0.25 ? 'L' : 'N');

const ROLES: Role[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST'];
const TPL: Record<Exclude<Role, 'GK'>, number[]> = {
  // pac sho pas dri att def phy hea
  ST: [2, 5, -4, 0, 5, -32, 2, 2], LW: [6, 0, 1, 5, 2, -28, -6, -12], RW: [6, 0, 1, 5, 2, -28, -6, -12], LM: [5, -3, 3, 4, 0, -16, -4, -10], RM: [5, -3, 3, 4, 0, -16, -4, -10],
  AM: [1, 1, 5, 5, 4, -26, -7, -10], CM: [-1, -4, 4, 2, -1, -4, 0, -4], DM: [-2, -10, 2, -3, -8, 5, 4, 1], LB: [5, -16, 0, 1, -6, 2, -1, -4], RB: [5, -16, 0, 1, -6, 2, -1, -4],
  CB: [-3, -26, -5, -10, -18, 5, 5, 5],
};
const KEYS: (keyof OutfieldAttrs)[] = ['pac', 'sho', 'pas', 'dri', 'att', 'def', 'phy', 'hea'];

/** Attributes for a role that add up to the wanted overall rating. */
export function attrsFor(role: Role, ovr: number): OutfieldAttrs | KeeperAttrs {
  const n = (amp = 4) => (next() - 0.5) * 2 * amp;
  if (role === 'GK') {
    const a: KeeperAttrs = { ref: ovr + n(), pos: ovr + n(), han: ovr + n(), kic: ovr - 8 + n(6), con: ovr - 2 + n(), men: ovr + n(), sta: 80 + n() };
    for (const k in a) a[k as keyof KeeperAttrs] = clamp(Math.round(a[k as keyof KeeperAttrs]), 25, 99);
    return a;
  }
  const t = TPL[role], w = W_ROLE[role];
  const a = { dis: clamp(Math.round(70 + n(10)), 35, 95), sta: clamp(Math.round(68 + n(10)), 40, 95) } as OutfieldAttrs;
  KEYS.forEach((k, i) => (a[k] = ovr + t[i] + n()));
  for (let it = 0; it < 4; it++) {
    let cur = 0;
    for (const k of KEYS) cur += (w[k] ?? 0) * clamp(a[k], 20, 99);
    const d = ovr - cur;
    for (const k of KEYS) if ((w[k] ?? 0) > 0.03) a[k] += d;
  }
  for (const k of KEYS) a[k] = clamp(Math.round(a[k]), 20, 99);
  return a;
}

export interface GenOpts { team?: Team | null; country?: string; age?: number; ovr?: number; pot?: number; role?: Role }

export function genPlayer(L: League, o: GenOpts = {}): Player {
  const country = o.country ?? o.team?.country ?? 'RUS';
  const pool = YOUTH[country] ?? YOUTH.ENG;
  const role = o.role ?? pick(ROLES);
  const age = o.age ?? int(16, 18);
  const ovr = Math.round(o.ovr ?? clamp(normal(52, 4), 42, 64));
  const pot = Math.round(o.pot ?? clamp(ovr + Math.abs(normal(12, 8)), ovr + 2, 94));
  const fn = pick(pool.fn), ln = pick(pool.ln);
  const y = Number(L.date.slice(0, 4)) - age;
  const p: Player = {
    id: L.nextId++, fn, ln, ...(pool.ru ? { ru: `${fn} ${ln}` } : {}),
    pos: posOfRole(role), role, foot: weighted(['R', 'L', 'B'] as const, [0.72, 0.22, 0.06]),
    bd: `${y}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
    ctry: country, ht: role === 'GK' ? int(184, 198) : role === 'CB' ? int(180, 196) : int(168, 190), num: null, img: null, real: false,
    team: o.team?.id ?? null, st: o.team ? 'ACT' : 'FA', ovr, pot, r: attrsFor(role, ovr), tr: [], val: 0,
    c: o.team ? { wage: Math.max(15_000, roundMoney(wageFor(ovr, o.team.lg) * 0.6)), until: L.season + 3, signed: L.season } : null,
    morale: 70, form: 0, fit: 100, inj: null, pers: personality(), dev: devType(), stats: {}, hist: [], awards: [], teams: o.team ? [o.team.id] : [],
    caps: 0, ig: 0, joined: L.season, yth: true,
  };
  p.ovr = calcOvr(p);
  p.pot = Math.max(p.pot, p.ovr);
  p.val = Math.max(MIN_VALUE, roundMoney(1e5 * Math.pow(10, (p.ovr + 0.3 * (p.pot - p.ovr) + 4 - 58) / 10)));
  L.players[p.id] = p;
  touchSquads();
  return p;
}
