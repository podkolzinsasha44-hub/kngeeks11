// Formations, line-up selection and team strength. The strength computed here from the
// eleven players actually on the pitch is the only input of the match engine and of the
// odds shown to the user — there is no separate "club rating".
import type { FormationId, KeeperAttrs, League, Lineup, OutfieldAttrs, Player, Role, Team } from './types';
import { keeperOvr, posOfRole, roleRating } from './util';

export const FORMATIONS: Record<FormationId, Role[]> = {
  '4-4-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'ST', 'ST'],
  '4-3-3': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'CM', 'CM', 'RW', 'ST', 'LW'],
  '4-2-3-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'RW', 'AM', 'LW', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'RM', 'DM', 'CM', 'CM', 'LM', 'ST', 'ST'],
  '5-3-2': ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'CM', 'DM', 'CM', 'ST', 'ST'],
  '4-1-4-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'RM', 'CM', 'CM', 'LM', 'ST'],
  '3-4-3': ['GK', 'CB', 'CB', 'CB', 'RM', 'CM', 'CM', 'LM', 'RW', 'ST', 'LW'],
};
export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];
export const BENCH_SIZE = 12;

/** Pitch coordinates of every slot: x 0..1 from own goal, y 0..1 from the left touchline. */
export function slotXY(form: FormationId): [number, number][] {
  const roles = FORMATIONS[form];
  const X: Record<Role, number> = { GK: 0.05, CB: 0.2, LB: 0.25, RB: 0.25, DM: 0.4, CM: 0.5, LM: 0.56, RM: 0.56, AM: 0.66, LW: 0.76, RW: 0.76, ST: 0.86 };
  const fixedY: Partial<Record<Role, number>> = { GK: 0.5, LB: 0.1, RB: 0.9, LM: 0.1, RM: 0.9, LW: 0.14, RW: 0.86 };
  const out: [number, number][] = roles.map((r) => [X[r], fixedY[r] ?? -1]);
  // Spread central roles of the same kind evenly.
  for (const r of ['CB', 'DM', 'CM', 'AM', 'ST'] as Role[]) {
    const idx = roles.map((x, i) => (x === r ? i : -1)).filter((i) => i >= 0);
    idx.forEach((i, k) => (out[i][1] = 0.5 + (k - (idx.length - 1) / 2) * (idx.length >= 3 ? 0.22 : 0.26)));
  }
  return out;
}

const MIRROR: Partial<Record<Role, Role>> = { LB: 'RB', RB: 'LB', LW: 'RW', RW: 'LW', LM: 'RM', RM: 'LM' };
const NEAR: [Role, Role, number][] = [
  ['LM', 'LW', 0.98], ['RM', 'RW', 0.98], ['CM', 'DM', 0.96], ['CM', 'AM', 0.96], ['AM', 'ST', 0.93], ['LW', 'ST', 0.93], ['RW', 'ST', 0.93],
  ['AM', 'LW', 0.95], ['AM', 'RW', 0.95], ['LB', 'LM', 0.94], ['RB', 'RM', 0.94], ['CB', 'DM', 0.93], ['CB', 'LB', 0.92], ['CB', 'RB', 0.92],
  ['LM', 'CM', 0.93], ['RM', 'CM', 0.93], ['LM', 'AM', 0.94], ['RM', 'AM', 0.94], ['LB', 'LW', 0.9], ['RB', 'RW', 0.9],
];

/** How well a player knows the slot role: 1 = natural position. */
export function familiarity(p: Player, slot: Role): number {
  if (p.role === slot) return 1;
  if (slot === 'GK' || p.role === 'GK') return 0.4;
  if (p.alt?.includes(slot)) return 0.985;
  if (MIRROR[p.role] === slot) return 0.965;
  for (const [a, b, v] of NEAR) if ((a === p.role && b === slot) || (b === p.role && a === slot)) return v;
  const pp = posOfRole(p.role), sp = posOfRole(slot);
  if (pp === sp) return 0.9;
  if (pp === 'M' || sp === 'M') return 0.84;
  return 0.76;
}

/** Rating of the player in a slot: attributes for that role × familiarity. */
export function slotRating(p: Player, slot: Role): number {
  if (slot === 'GK') return p.pos === 'G' ? keeperOvr(p.r as KeeperAttrs) : 30;
  if (p.pos === 'G') return 30;
  return roleRating(p.r as OutfieldAttrs, slot) * familiarity(p, slot);
}

export function available(p: Player) {
  return !p.inj && !(p.susp && p.susp > 0) && p.st === 'ACT';
}

// Squads are read constantly (line-ups, market, AI), so they are indexed once and the index is
// rebuilt only after something moved a player. Every engine function that changes `team` or
// `st` of a player calls touchSquads().
let cacheFor: League | null = null;
let cache = new Map<string, Player[]>();
export function touchSquads() {
  cacheFor = null;
}
export function squad(L: League, teamId: string): Player[] {
  if (cacheFor !== L) {
    cache = new Map();
    for (const id in L.players) {
      const p = L.players[id];
      if (!p.team || p.st !== 'ACT') continue;
      const arr = cache.get(p.team);
      if (arr) arr.push(p); else cache.set(p.team, [p]);
    }
    cacheFor = L;
  }
  // A copy: callers sort and filter freely.
  return (cache.get(teamId) ?? []).slice();
}

export const emptyLineup = (): Lineup => ({ form: '4-3-3', xi: [], bench: [], auto: true });

/** Best eleven for a formation from the given players (greedy assignment + pairwise improvement). */
export function bestXI(players: Player[], form: FormationId): { xi: Player[]; score: number } {
  const roles = FORMATIONS[form];
  const n = players.length;
  // Ratings of every player in every distinct role of the formation, computed once.
  const table = new Map<Role, Float64Array>();
  for (const r of roles) {
    if (table.has(r)) continue;
    const col = new Float64Array(n);
    for (let k = 0; k < n; k++) col[k] = slotRating(players[k], r) * (0.9 + 0.1 * (players[k].fit / 100));
    table.set(r, col);
  }
  const cols = roles.map((r) => table.get(r)!);
  const xi = new Int32Array(11).fill(-1);
  const used = new Uint8Array(n);
  for (let i = 0; i < 11; i++) {
    let best = -1, bv = -1;
    for (let k = 0; k < n; k++) if (!used[k] && cols[i][k] > bv) { bv = cols[i][k]; best = k; }
    if (best >= 0) { xi[i] = best; used[best] = 1; }
  }
  // Improve: swap two starters, or a starter with a reserve, while the total grows.
  let improved = true, guard = 0;
  while (improved && guard++ < 6) {
    improved = false;
    for (let i = 1; i < 11; i++) {
      if (xi[i] < 0) continue;
      for (let j = i + 1; j < 11; j++) {
        const x = xi[i], y = xi[j];
        if (y < 0) continue;
        if (cols[j][x] + cols[i][y] > cols[i][x] + cols[j][y] + 0.01) { xi[i] = y; xi[j] = x; improved = true; }
      }
      for (let k = 0; k < n; k++) {
        if (used[k]) continue;
        if (cols[i][k] > cols[i][xi[i]] + 0.01) { used[xi[i]] = 0; used[k] = 1; xi[i] = k; improved = true; }
      }
    }
  }
  let score = 0;
  const out: Player[] = [];
  for (let i = 0; i < 11; i++) if (xi[i] >= 0) { score += cols[i][xi[i]]; out.push(players[xi[i]]); }
  return { xi: out, score };
}

export function pickBench(players: Player[], xi: Player[], size = BENCH_SIZE): Player[] {
  const inXI = new Set(xi.map((p) => p.id));
  const rest = players.filter((p) => !inXI.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const bench: Player[] = [];
  const keeper = rest.find((p) => p.pos === 'G');
  if (keeper) bench.push(keeper);
  // At least two players per outfield line, then the best of the rest.
  for (const pos of ['D', 'M', 'F'] as const) bench.push(...rest.filter((p) => p.pos === pos).slice(0, 2));
  for (const p of rest) {
    if (bench.length >= size) break;
    if (!bench.includes(p) && p.pos !== 'G') bench.push(p);
  }
  return bench.slice(0, size);
}

const bestTaker = (xi: Player[]) =>
  [...xi].filter((p) => p.pos !== 'G').sort((a, b) => (b.r as OutfieldAttrs).sho - (a.r as OutfieldAttrs).sho)[0]?.id;

/** Picks formation (unless fixed), XI and bench from the available squad. Mutates team.lineup. */
export function autoLineup(L: League, team: Pick<Team, 'id' | 'lineup'>, roster?: Player[], opts: { keepForm?: boolean } = {}) {
  const avail = (roster ?? squad(L, team.id)).filter(available);
  const forms = opts.keepForm && team.lineup?.form ? [team.lineup.form] : FORMATION_IDS;
  let best: { xi: Player[]; score: number } | null = null, bf: FormationId = team.lineup?.form ?? '4-3-3';
  for (const f of forms) {
    const r = bestXI(avail, f);
    // A small bonus keeps the current shape unless another one is clearly better.
    const s = r.score + (f === team.lineup?.form ? 1.5 : 0);
    if (!best || s > best.score) { best = { xi: r.xi, score: s }; bf = f; }
  }
  const xi = best?.xi ?? [];
  const bench = pickBench(avail, xi);
  team.lineup = { form: bf, xi: xi.map((p) => p.id), bench: bench.map((p) => p.id), auto: team.lineup?.auto ?? true, pen: bestTaker(xi), cap: team.lineup?.cap };
}

/**
 * Checks a manually set line-up. Players who cannot play (injured, suspended, sold) are replaced
 * slot by slot with the best fitting reserve; everything else stays exactly as the user set it.
 */
export function validateLineup(L: League, team: Pick<Team, 'id' | 'lineup'>, roster?: Player[]): string[] {
  const notes: string[] = [];
  const all = roster ?? squad(L, team.id);
  const ok = (id: number) => {
    const p = L.players[id];
    return !!p && p.team === team.id && available(p);
  };
  const ln = team.lineup;
  const roles = FORMATIONS[ln.form];
  const used = new Set<number>();
  for (let i = 0; i < 11; i++) {
    const id = ln.xi[i];
    if (id != null && ok(id) && !used.has(id)) { used.add(id); continue; }
    const cands = all.filter((p) => available(p) && !used.has(p.id) && !ln.xi.includes(p.id)).sort((a, b) => slotRating(b, roles[i]) - slotRating(a, roles[i]));
    // Prefer someone already named on the bench when he fits about as well.
    const top = cands[0];
    const sub = cands.find((p) => ln.bench.includes(p.id) && top && slotRating(p, roles[i]) >= slotRating(top, roles[i]) - 2) ?? top;
    const old = id != null ? L.players[id] : null;
    if (sub) {
      ln.xi[i] = sub.id;
      used.add(sub.id);
      notes.push(`${old ? old.ln : 'Пустая позиция'} → ${sub.ln} (${roles[i]})`);
    }
  }
  ln.xi = ln.xi.slice(0, 11);
  const xiSet = new Set(ln.xi);
  ln.bench = ln.bench.filter((id, i, arr) => ok(id) && !xiSet.has(id) && arr.indexOf(id) === i);
  if (ln.bench.length < 7) {
    const extra = pickBench(all.filter(available), ln.xi.map((id) => L.players[id]).filter(Boolean));
    for (const p of extra) if (ln.bench.length < BENCH_SIZE && !ln.bench.includes(p.id)) ln.bench.push(p.id);
  }
  if (ln.pen == null || !xiSet.has(ln.pen)) ln.pen = bestTaker(ln.xi.map((id) => L.players[id]).filter(Boolean));
  return notes;
}

/** True when the XI is complete and every player in it can play today. */
export function lineupValid(L: League, team: Pick<Team, 'id' | 'lineup'>) {
  const ln = team.lineup;
  if (ln.xi.length !== 11 || new Set(ln.xi).size !== 11) return false;
  return ln.xi.every((id) => {
    const p = L.players[id];
    return !!p && p.team === team.id && available(p);
  });
}

// ----- Team strength ---------------------------------------------------------------------------

/** Share of every role in the three phases of play: [attack, midfield, defence]. */
export const PHASE: Record<Role, [number, number, number]> = {
  GK: [0, 0, 0],
  CB: [0.04, 0.15, 1], LB: [0.25, 0.35, 0.75], RB: [0.25, 0.35, 0.75],
  DM: [0.15, 0.85, 0.7], CM: [0.38, 1, 0.42], AM: [0.72, 0.6, 0.1],
  LM: [0.55, 0.6, 0.3], RM: [0.55, 0.6, 0.3], LW: [0.8, 0.35, 0.14], RW: [0.8, 0.35, 0.14], ST: [1, 0.15, 0.05],
};

export const offQ = (a: OutfieldAttrs) => 0.3 * a.sho + 0.3 * a.att + 0.2 * a.dri + 0.1 * a.pac + 0.1 * a.pas;
export const midQ = (a: OutfieldAttrs) => 0.42 * a.pas + 0.2 * a.dri + 0.14 * a.att + 0.14 * a.def + 0.1 * a.sta;
export const defQ = (a: OutfieldAttrs) => 0.55 * a.def + 0.2 * a.phy + 0.13 * a.pac + 0.12 * a.hea;

export interface OnPitch {
  p: Player;
  slot: Role;
  /** Condition multiplier: form, morale, fitness, in-match fatigue. */
  cond: number;
}
export interface Strength { att: number; mid: number; def: number; gk: number }

/** Condition of a player before kick-off: form, morale and match fitness. */
export function condition(p: Player) {
  return (1 + p.form * 0.02 + (p.morale - 65) / 3000) * (0.88 + 0.12 * (p.fit / 100));
}

/** Strength of the players currently on the pitch. Fewer than eleven players (red cards) weakens every phase. */
export function strengthOf(on: OnPitch[]): Strength {
  let a = 0, aw = 0, m = 0, mw = 0, d = 0, dw = 0, g = 30, out = 0;
  for (const o of on) {
    if (o.slot === 'GK') {
      g = (o.p.pos === 'G' ? keeperOvr(o.p.r as KeeperAttrs) : 30) * o.cond;
      continue;
    }
    out++;
    if (o.p.pos === 'G') continue;
    const at = o.p.r as OutfieldAttrs;
    const f = familiarity(o.p, o.slot) * o.cond;
    const [wa, wm, wd] = PHASE[o.slot];
    a += wa * offQ(at) * f; aw += wa;
    m += wm * midQ(at) * f; mw += wm;
    d += wd * defQ(at) * f; dw += wd;
  }
  const down = Math.max(0, 10 - out);
  return {
    att: (aw ? a / aw : 40) * Math.pow(0.9, down),
    mid: (mw ? m / mw : 40) * Math.pow(0.9, down),
    def: (dw ? d / dw : 40) * Math.pow(0.95, down),
    gk: g,
  };
}

export function lineupOnPitch(L: { players: Record<number, Player> }, ln: Lineup): OnPitch[] {
  const roles = FORMATIONS[ln.form];
  const out: OnPitch[] = [];
  ln.xi.forEach((id, i) => {
    const p = L.players[id];
    if (p) out.push({ p, slot: roles[i], cond: condition(p) });
  });
  return out;
}

export function adjust(s: Strength, coach: number, tactic: Team['tactic']): Strength {
  const c = (coach - 72) * 0.06;
  const ta = tactic === 'attack' ? 1.2 : tactic === 'defense' ? -1.2 : 0;
  return { att: s.att + c + ta, mid: s.mid + c, def: s.def + c - ta, gk: s.gk };
}

type Sideish = Pick<Team, 'lineup' | 'coach' | 'tactic'>;

/** Strength of a club's current line-up plus the coach and tactic adjustments used by the engine. */
export function teamStrength(L: { players: Record<number, Player> }, t: Sideish): Strength {
  return adjust(strengthOf(lineupOnPitch(L, t.lineup)), t.coach.rating, t.tactic);
}

/** One-number power of the current line-up (0-100) for tables, AI decisions and the interface. */
export function teamPower(L: { players: Record<number, Player> }, t: Sideish): number {
  const s = teamStrength(L, t);
  return 0.34 * s.att + 0.28 * s.mid + 0.26 * s.def + 0.12 * s.gk;
}

/** An absence up to this many days (about four matches) is not a hole in the squad for planning. */
export const SHORT_ABSENCE = 30;

/** Out now, but back within `days`: an injury or a suspension. */
export const backSoon = (p: Player, days = SHORT_ABSENCE) => p.st === 'ACT' && !available(p) && (!p.inj || p.inj.days <= days);

/**
 * The eleven for squad planning (transfer advice, sales, renewals): players out for a short time take
 * back the place where they are better than the stand-in; every other choice of the line-up stays.
 * The line-up that plays the next match is not changed.
 */
export function plannedLineup(L: League, t: Pick<Team, 'id' | 'lineup'>, days = SHORT_ABSENCE): Lineup {
  const roles = FORMATIONS[t.lineup.form];
  const xi = [...t.lineup.xi];
  const back = squad(L, t.id).filter((p) => backSoon(p, days) && !xi.includes(p.id)).sort((a, b) => b.ovr - a.ovr);
  for (const p of back) {
    let bi = -1, gain = 0;
    roles.forEach((r, i) => {
      const cur = L.players[xi[i]];
      const g = slotRating(p, r) - (cur ? slotRating(cur, r) : 0);
      if (g > gain) { gain = g; bi = i; }
    });
    if (bi >= 0) xi[bi] = p.id;
  }
  return { ...t.lineup, xi };
}

/** The team as it is planned: the same club with the planned eleven. */
export const planned = <T extends Pick<Team, 'id' | 'lineup'>>(L: League, t: T, days = SHORT_ABSENCE): T => ({ ...t, lineup: plannedLineup(L, t, days) });
