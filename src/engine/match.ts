// Match engine: a game is played minute by minute by the eleven players named in each line-up.
// Chances, finishing, cards, injuries and substitutions all depend on the players on the pitch.
// Constants are calibrated against real league totals (scripts/calibrate.ts).
// The engine does not know which club a human manages: both sides go through exactly the same code.

import { next, normal } from './rng';
import { FORMATIONS, PHASE, adjust, condition, familiarity, slotRating, strengthOf, type OnPitch, type Strength } from './lineup';
import type { GameEvent, GameResult, KeeperAttrs, Lineup, OutfieldAttrs, Player, Role, Tactic } from './types';
import { clamp, keeperOvr } from './util';

export const K = {
  /** Shots per team per minute between equal sides. */
  SHOT: 0.132,
  /** Sensitivity of shot volume / chance quality to (attack − defence), per 10 rating points. */
  KS: 0.3,
  KQ: 0.11,
  /** Saturation of the gap, rating points. */
  SAT: 22,
  /** Finishing of the shooter and quality of the keeper, per 10 rating points. */
  KF: 0.12,
  KG: 0.14,
  HOME: 1.13,
  AWAY: 0.9,
  /** Shot quality mix: [share, xG]. */
  MIX: [[0.06, 0.38], [0.24, 0.16], [0.45, 0.07], [0.25, 0.03]] as [number, number][],
  PEN: 0.00145,
  PEN_P: 0.77,
  YELLOW: 0.0225,
  RED: 0.00045,
  INJ: 0.00042,
  SO_P: 0.75,
};
export const MEAN_XG = K.MIX.reduce((s, [w, x]) => s + w * x, 0);

export interface MatchSide {
  id: string;
  short: string;
  lineup: Lineup;
  tactic: Tactic;
  /** Coach rating. */
  coach: number;
}

export interface MatchOpts {
  /** Knock-out game: extra time and penalties when level. */
  knockout?: boolean;
  /** First-leg score [this home side, this away side] of a two-legged tie. */
  agg?: [number, number];
  neutral?: boolean;
  /** League playing style (same for both teams): shot volume and finishing multipliers. */
  style?: { shot: number; fin: number };
  detail?: boolean;
  subs?: number;
}

export interface PStat {
  p: Player;
  id: number;
  home: boolean;
  slot: Role;
  started: boolean;
  /** Minute the player came on / went off. */
  on: number;
  off: number;
  min: number;
  g: number; a: number; sh: number; yc: number; rc: number; sv: number; ga: number;
  rt: number;
}

interface Side {
  in: MatchSide;
  home: boolean;
  on: (OnPitch & { st: PStat; base: number })[];
  bench: Player[];
  str: Strength;
  mul: number;
  goals: number;
  shots: number;
  onT: number;
  xg: number;
  subs: number;
  reds: number;
  stats: PStat[];
}

export interface MatchBox {
  result: GameResult;
  players: PStat[];
  home: MatchSide;
  away: MatchSide;
}

type P = Record<number, Player>;

const fin = (p: Player) => {
  if (p.pos === 'G') return 40;
  const a = p.r as OutfieldAttrs;
  return 0.62 * a.sho + 0.26 * a.att + 0.12 * a.dri;
};
const vis = (p: Player) => {
  if (p.pos === 'G') return 45;
  const a = p.r as OutfieldAttrs;
  return 0.7 * a.pas + 0.2 * a.att + 0.1 * a.dri;
};
export const shooterWeight = (o: OnPitch) =>
  o.slot === 'GK' ? 0 : (PHASE[o.slot][0] * 0.9 + 0.06 + (o.slot === 'CB' ? ((o.p.r as OutfieldAttrs).hea - 60) / 700 : 0)) * Math.exp((fin(o.p) - 70) / 45);
const assistWeight = (o: OnPitch) =>
  o.slot === 'GK' ? 0.02 : (0.25 + PHASE[o.slot][0] * 0.5 + PHASE[o.slot][1] * 0.6) * Math.exp((vis(o.p) - 70) / 20);

/**
 * Attack-vs-defence gap that drives both the engine and the analytic expectation. Very large gaps
 * saturate: a mismatch of 25 rating points is not twice as lopsided as one of 12.
 */
export const gap = (a: Strength, d: Strength) => K.SAT * Math.tanh((0.6 * a.att + 0.4 * a.mid - (0.6 * d.def + 0.4 * d.mid)) / K.SAT);

/** Average finishing of a side weighted by who takes the shots. */
export function finishing(on: OnPitch[]) {
  let w = 0, s = 0;
  for (const o of on) { const x = shooterWeight(o); w += x; s += x * fin(o.p) * o.cond; }
  return w ? s / w : 60;
}

/**
 * Expected goals of both sides before kick-off, from the same formulas the engine plays with.
 * Used for projections; the engine adds what only happens inside a match (cards, fatigue, substitutions).
 */
export function expectedGoals(h: { str: Strength; fin: number }, a: { str: Strength; fin: number }, o: { neutral?: boolean; style?: { shot: number; fin: number } } = {}): [number, number] {
  const one = (x: typeof h, y: typeof h, loc: number) => {
    const g = gap(x.str, y.str) / 10;
    const vol = Math.exp(K.KS * g) * loc * (o.style?.shot ?? 1);
    const p = clamp(MEAN_XG * (o.style?.fin ?? 1) * Math.exp(K.KF * (x.fin - 70) / 10 - K.KG * (y.str.gk - 70) / 10 + K.KQ * g), 0.01, 0.6);
    return 90 * (K.SHOT * vol * p + K.PEN * vol * K.PEN_P);
  };
  return [one(h, a, o.neutral ? 1 : K.HOME), one(a, h, o.neutral ? 1 : K.AWAY)];
}

function mkSide(players: P, s: MatchSide, home: boolean): Side {
  const roles = FORMATIONS[s.lineup.form];
  const stats: PStat[] = [];
  const on: Side['on'] = [];
  s.lineup.xi.forEach((id, i) => {
    const p = players[id];
    if (!p) return;
    const st: PStat = { p, id, home, slot: roles[i], started: true, on: 0, off: 0, min: 0, g: 0, a: 0, sh: 0, yc: 0, rc: 0, sv: 0, ga: 0, rt: 6 };
    stats.push(st);
    const c = condition(p);
    on.push({ p, slot: roles[i], cond: c, base: c, st });
  });
  const side: Side = {
    in: s, home, on, stats, bench: s.lineup.bench.map((id) => players[id]).filter(Boolean),
    str: { att: 0, mid: 0, def: 0, gk: 0 }, mul: 1, goals: 0, shots: 0, onT: 0, xg: 0, subs: 0, reds: 0,
  };
  refresh(side, 0);
  return side;
}

/** Recomputes fatigue and team strength from the players on the pitch right now. */
function refresh(s: Side, minute: number) {
  for (const o of s.on) {
    const sta = o.p.pos === 'G' ? 95 : (o.p.r as OutfieldAttrs).sta;
    const played = minute - o.st.on;
    const tired = Math.max(0, played - 55) / 45;
    o.cond = o.base * (1 - tired * 0.12 * (1.25 - sta / 100));
  }
  s.str = adjust(strengthOf(s.on), s.in.coach, s.in.tactic);
}

function pickW<T>(arr: T[], w: (x: T) => number, exclude?: T): T | undefined {
  let total = 0;
  for (const x of arr) if (x !== exclude) total += w(x);
  if (total <= 0) return arr.find((x) => x !== exclude);
  let r = next() * total;
  for (const x of arr) {
    if (x === exclude) continue;
    r -= w(x);
    if (r <= 0) return x;
  }
  return arr.find((x) => x !== exclude);
}

const nm = (p: Player) => p.ru ? p.ru.split(' ').slice(-1)[0] : p.ln;
const INJ_TYPES: [string, number, number, number][] = [
  ['Ушиб', 0.26, 2, 10], ['Растяжение мышцы бедра', 0.2, 7, 28], ['Повреждение голеностопа', 0.13, 7, 35],
  ['Травма паха', 0.08, 7, 30], ['Повреждение икроножной мышцы', 0.08, 7, 25], ['Травма колена', 0.08, 14, 80],
  ['Сотрясение', 0.04, 6, 14], ['Травма спины', 0.04, 4, 25], ['Перелом плюсневой кости', 0.03, 40, 80],
  ['Разрыв крестообразных связок', 0.02, 180, 260], ['Болезнь', 0.04, 2, 6],
];
export function rollInjury(id: number) {
  let r = next() * INJ_TYPES.reduce((a, x) => a + x[1], 0);
  for (const [type, w, lo, hi] of INJ_TYPES) {
    r -= w;
    if (r <= 0) {
      const u = next();
      return { id, days: Math.round(lo + (hi - lo) * u * u), type };
    }
  }
  return { id, days: 4, type: 'Ушиб' };
}

export function simulateMatch(players: P, home: MatchSide, away: MatchSide, o: MatchOpts = {}): MatchBox {
  const detail = !!o.detail;
  const H = mkSide(players, home, true), A = mkSide(players, away, false);
  const events: GameEvent[] = [];
  const shotsMap: GameResult['shotsMap'] = [];
  const injuries: GameResult['injuries'] = [];
  const momentum = new Array(18).fill(0);
  const ev = (e: GameEvent) => { if (detail) events.push(e); };
  const styleShot = o.style?.shot ?? 1, styleFin = o.style?.fin ?? 1;
  const maxSubs = o.subs ?? 5;
  H.mul = o.neutral ? 1 : K.HOME;
  A.mul = o.neutral ? 1 : K.AWAY;
  let possH = 0, possN = 0;
  ev({ m: 0, type: 'kickoff', team: '', text: 'Стартовый свисток' });

  const substitute = (s: Side, out: Side['on'][number], minute: number, forced: boolean) => {
    if (s.subs >= maxSubs || !s.bench.length) return false;
    let best: Player | undefined, bv = -1;
    for (const b of s.bench) {
      const v = slotRating(b, out.slot) * condition(b);
      if (v > bv) { bv = v; best = b; }
    }
    if (!best) return false;
    // A tactical change only happens when the reserve is not clearly worse than the tired starter.
    if (!forced && bv < slotRating(out.p, out.slot) * out.cond - 5) return false;
    s.bench = s.bench.filter((b) => b !== best);
    out.st.off = minute;
    out.st.min += minute - out.st.on;
    const st: PStat = { p: best, id: best.id, home: s.home, slot: out.slot, started: false, on: minute, off: 0, min: 0, g: 0, a: 0, sh: 0, yc: 0, rc: 0, sv: 0, ga: 0, rt: 6 };
    s.stats.push(st);
    const c = condition(best);
    s.on[s.on.indexOf(out)] = { p: best, slot: out.slot, cond: c, base: c, st };
    s.subs++;
    ev({ m: minute, type: 'sub', team: s.in.id, players: [best.id, out.p.id], text: `Замена: ${nm(best)} вместо ${nm(out.p)}` });
    return true;
  };

  const sendOff = (s: Side, x: Side['on'][number], minute: number) => {
    x.st.rc = 1;
    x.st.off = minute;
    x.st.min += minute - x.st.on;
    s.on = s.on.filter((y) => y !== x);
    s.reds++;
    // A sent-off keeper is replaced by the reserve keeper at the cost of an outfield player.
    if (x.slot === 'GK') {
      const gkB = s.bench.find((b) => b.pos === 'G');
      const victim = [...s.on].sort((a, b) => PHASE[b.slot][0] - PHASE[a.slot][0])[0];
      if (gkB && victim && s.subs < maxSubs) {
        s.bench = s.bench.filter((b) => b !== gkB);
        victim.st.off = minute; victim.st.min += minute - victim.st.on;
        const st: PStat = { p: gkB, id: gkB.id, home: s.home, slot: 'GK', started: false, on: minute, off: 0, min: 0, g: 0, a: 0, sh: 0, yc: 0, rc: 0, sv: 0, ga: 0, rt: 6 };
        s.stats.push(st);
        const c = condition(gkB);
        s.on[s.on.indexOf(victim)] = { p: gkB, slot: 'GK', cond: c, base: c, st };
        s.subs++;
      } else if (victim) victim.slot = 'GK';
    }
  };

  const goal = (att: Side, dfn: Side, shooter: Side['on'][number], minute: number, text: string, type: GameEvent['type'] = 'goal') => {
    att.goals++;
    shooter.st.g++;
    const keeper = dfn.on.find((x) => x.slot === 'GK');
    if (keeper) keeper.st.ga++;
    let assist: Side['on'][number] | undefined;
    if (type === 'goal' && next() < 0.72) {
      assist = pickW(att.on, assistWeight, shooter);
      if (assist) assist.st.a++;
    }
    ev({
      m: minute, type, team: att.in.id, players: assist ? [shooter.p.id, assist.p.id] : [shooter.p.id],
      score: [H.goals, A.goals], text: `${text} ${nm(shooter.p)}${assist ? ` (пас: ${nm(assist.p)})` : ''}`,
    });
  };

  const attack = (att: Side, dfn: Side, minute: number, pushMul: number) => {
    const g = gap(att.str, dfn.str) / 10;
    const vol = Math.exp(K.KS * g) * att.mul * pushMul;
    // Penalty
    if (next() < K.PEN * vol * styleShot) {
      const taker = att.on.find((x) => x.p.id === att.in.lineup.pen) ?? [...att.on].sort((a, b) => fin(b.p) - fin(a.p))[0];
      if (taker) {
        att.shots++; taker.st.sh++;
        const p = clamp(K.PEN_P + (fin(taker.p) - 75) * 0.003 - (dfn.str.gk - 75) * 0.003, 0.6, 0.92);
        att.xg += K.PEN_P;
        momentum[Math.min(17, Math.floor((minute - 1) / 5))] += (att.home ? 1 : -1) * K.PEN_P;
        const scored = next() < p;
        if (detail) shotsMap.push({ team: att.in.id, x: 0.885, y: 0.5, goal: scored, xg: K.PEN_P });
        if (scored) { att.onT++; goal(att, dfn, taker, minute, 'Гол с пенальти!', 'pen'); return; }
        const keeper = dfn.on.find((x) => x.slot === 'GK');
        if (next() < 0.7) { att.onT++; if (keeper) keeper.st.sv++; }
        ev({ m: minute, type: 'penmiss', team: att.in.id, players: [taker.p.id], text: `${nm(taker.p)} не забивает пенальти` });
      }
    }
    if (next() >= K.SHOT * vol * styleShot) return;
    const shooter = pickW(att.on, shooterWeight);
    if (!shooter) return;
    let r = next(), xg = K.MIX[K.MIX.length - 1][1], kind = K.MIX.length - 1;
    for (let i = 0; i < K.MIX.length; i++) {
      r -= K.MIX[i][0];
      if (r <= 0) { xg = K.MIX[i][1]; kind = i; break; }
    }
    const p = clamp(xg * styleFin * Math.exp(K.KF * (fin(shooter.p) * shooter.cond - 70) / 10 - K.KG * (dfn.str.gk - 70) / 10 + K.KQ * g), 0.005, 0.9);
    att.shots++; shooter.st.sh++; att.xg += p;
    momentum[Math.min(17, Math.floor((minute - 1) / 5))] += (att.home ? 1 : -1) * p;
    const scored = next() < p;
    if (detail) {
      const x = kind === 0 ? 0.9 + next() * 0.06 : kind === 1 ? 0.84 + next() * 0.1 : kind === 2 ? 0.76 + next() * 0.14 : 0.62 + next() * 0.14;
      const y = kind <= 1 ? 0.36 + next() * 0.28 : 0.2 + next() * 0.6;
      shotsMap.push({ team: att.in.id, x, y, goal: scored, xg: p });
    }
    if (scored) {
      att.onT++;
      goal(att, dfn, shooter, minute, kind === 0 ? 'Гол! Выход один на один —' : kind === 3 ? 'Гол дальним ударом!' : 'Гол!');
      return;
    }
    // Missed: on target (save) or off target / blocked.
    if (next() < 0.25 + kind * -0.02 + 0.1) {
      att.onT++;
      const keeper = dfn.on.find((x) => x.slot === 'GK');
      if (keeper) keeper.st.sv++;
      if (kind <= 1) ev({ m: minute, type: 'save', team: dfn.in.id, players: keeper ? [keeper.p.id, shooter.p.id] : [shooter.p.id], text: `${keeper ? nm(keeper.p) : 'Вратарь'} спасает после удара ${nm(shooter.p)}` });
    } else if (kind === 0) {
      ev({ m: minute, type: 'chance', team: att.in.id, players: [shooter.p.id], text: `${nm(shooter.p)} упускает отличный момент` });
    }
  };

  const discipline = (s: Side, minute: number, heat: number) => {
    if (next() < K.YELLOW * heat) {
      const x = pickW(s.on, (y) => (y.slot === 'GK' ? 0.12 : (112 - (y.p.r as OutfieldAttrs).dis) * (0.6 + PHASE[y.slot][2] * 0.7 + PHASE[y.slot][1] * 0.3) * (y.st.yc ? 0.45 : 1)));
      if (x) {
        if (x.st.yc) {
          x.st.yc = 2;
          sendOff(s, x, minute);
          ev({ m: minute, type: 'red', team: s.in.id, players: [x.p.id], text: `Вторая жёлтая — ${nm(x.p)} удалён` });
          return true;
        }
        x.st.yc = 1;
        ev({ m: minute, type: 'yellow', team: s.in.id, players: [x.p.id], text: `Жёлтая карточка: ${nm(x.p)}` });
      }
    }
    if (next() < K.RED * heat) {
      const x = pickW(s.on, (y) => (y.slot === 'GK' ? 0.25 : (112 - (y.p.r as OutfieldAttrs).dis) * (0.5 + PHASE[y.slot][2])));
      if (x) {
        sendOff(s, x, minute);
        ev({ m: minute, type: 'red', team: s.in.id, players: [x.p.id], text: `Прямая красная: ${nm(x.p)}` });
        return true;
      }
    }
    return false;
  };

  const knocks = (s: Side, minute: number) => {
    if (next() >= K.INJ * 11) return false;
    const x = pickW(s.on, (y) => 1.7 - (y.p.pos === 'G' ? 95 : (y.p.r as OutfieldAttrs).sta) / 100 - y.p.fit / 400);
    if (!x) return false;
    injuries.push(rollInjury(x.p.id));
    ev({ m: minute, type: 'injury', team: s.in.id, players: [x.p.id], text: `${nm(x.p)} получает повреждение` });
    if (!substitute(s, x, minute, true)) {
      x.st.off = minute; x.st.min += minute - x.st.on;
      s.on = s.on.filter((y) => y !== x);
      if (x.slot === 'GK' && s.on[0]) s.on[0].slot = 'GK';
    }
    return true;
  };

  /** Planned changes: the most tired or weakest players make way at fixed windows. */
  const changes = (s: Side, opp: Side, minute: number) => {
    const n = minute === 60 ? (next() < 0.55 ? 1 : 2) : minute === 70 ? 1 : minute === 78 ? (next() < 0.5 ? 1 : 2) : minute === 86 ? (next() < 0.5 ? 1 : 0) : minute >= 100 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const cands = s.on.filter((x) => x.slot !== 'GK' && x.st.started);
      if (!cands.length) return;
      const trailing = s.goals < opp.goals;
      // Score to leave: tired, booked, or simply the weakest link; attackers stay on when chasing the game.
      const out = cands.sort((a, b) => {
        const sc = (y: typeof a) => slotRating(y.p, y.slot) * y.cond - (y.st.yc ? 3 : 0) + (trailing ? PHASE[y.slot][0] * 4 : PHASE[y.slot][2] * 2) + y.st.g * 4;
        return sc(a) - sc(b);
      })[0];
      substitute(s, out, minute, false);
    }
  };

  const minuteTick = (minute: number, extra: boolean) => {
    const diff = H.goals - A.goals;
    const late = minute > 60 ? 1 : 0.4;
    // Game state: the side behind pushes forward and leaves space; the side ahead sits deeper.
    const hPush = diff < 0 ? 1 + 0.13 * late : diff > 0 ? 1 - 0.07 * late : 1;
    const aPush = diff > 0 ? 1 + 0.13 * late : diff < 0 ? 1 - 0.07 * late : 1;
    const tempo = extra ? 0.85 : 1;
    const share = H.str.mid / (H.str.mid + A.str.mid);
    possH += clamp(0.5 + (share - 0.5) * 2.2 + (diff < 0 ? 0.03 : diff > 0 ? -0.03 : 0), 0.25, 0.75); possN++;
    if (next() < 0.5) { attack(H, A, minute, hPush * tempo); attack(A, H, minute, aPush * tempo); }
    else { attack(A, H, minute, aPush * tempo); attack(H, A, minute, hPush * tempo); }
    const heat = (Math.abs(diff) <= 1 ? 1.05 : 0.85) * (minute > 75 ? 1.25 : minute < 20 ? 0.7 : 1);
    let dirty = false;
    if (discipline(H, minute, heat * (o.neutral ? 1 : 0.94))) dirty = true;
    if (discipline(A, minute, heat * (o.neutral ? 1 : 1.06))) dirty = true;
    if (knocks(H, minute)) dirty = true;
    if (knocks(A, minute)) dirty = true;
    if (minute === 60 || minute === 70 || minute === 78 || minute === 86 || minute === 100 || minute === 110) {
      changes(H, A, minute); changes(A, H, minute); dirty = true;
    }
    if (dirty || minute % 10 === 0) { refresh(H, minute); refresh(A, minute); }
  };

  for (let m = 1; m <= 90; m++) {
    minuteTick(m, false);
    if (m === 45) ev({ m: 45, type: 'half', team: '', score: [H.goals, A.goals], text: 'Перерыв' });
  }
  let et = false, pen: [number, number] | null = null;
  const level = () => H.goals + (o.agg?.[0] ?? 0) === A.goals + (o.agg?.[1] ?? 0);
  if (o.knockout && level()) {
    et = true;
    ev({ m: 90, type: 'half', team: '', score: [H.goals, A.goals], text: 'Основное время — ничья. Дополнительное время' });
    for (let m = 91; m <= 120; m++) minuteTick(m, true);
    if (level()) {
      const kick = (s: Side, d: Side, i: number) => {
        const order = [...s.on].filter((x) => x.slot !== 'GK').sort((a, b) => fin(b.p) - fin(a.p));
        const k = order[i % Math.max(1, order.length)] ?? s.on[0];
        const p = clamp(K.SO_P + (fin(k.p) - 72) * 0.004 - (d.str.gk - 72) * 0.005, 0.55, 0.9);
        const ok = next() < p;
        ev({ m: 120, type: 'shootout', team: s.in.id, players: [k.p.id], text: `Серия пенальти: ${nm(k.p)} ${ok ? '— гол' : '— мимо'}` });
        return ok;
      };
      let h = 0, a = 0;
      for (let i = 0; i < 5; i++) {
        if (kick(H, A, i)) h++;
        if (h > a + (5 - i) || a > h + (4 - i)) break;
        if (kick(A, H, i)) a++;
        if (h > a + (4 - i) || a > h + (4 - i)) break;
      }
      for (let i = 5; h === a && i < 40; i++) {
        const hk = kick(H, A, i), ak = kick(A, H, i);
        if (hk) h++;
        if (ak) a++;
      }
      if (h === a) (next() < 0.5 ? h++ : a++);
      pen = [h, a];
    }
  }
  const total = et ? 120 : 90;
  ev({ m: total, type: 'end', team: '', score: [H.goals, A.goals], text: 'Финальный свисток' });

  // Minutes and ratings
  const all = [...H.stats, ...A.stats];
  for (const s of [H, A]) {
    const opp = s === H ? A : H;
    const won = s.goals > opp.goals, lost = s.goals < opp.goals;
    for (const st of s.stats) {
      if (!st.off && !st.rc) st.min += total - st.on;
      const share = Math.min(1, st.min / 90);
      const back = st.slot === 'GK' || PHASE[st.slot][2] >= 0.7;
      let r = 6 + st.g * 1.0 + st.a * 0.65 + st.sh * 0.05 - (st.yc === 1 ? 0.2 : 0) - (st.rc ? 1.6 : 0) + st.sv * 0.14;
      r += share * ((won ? 0.3 : lost ? -0.3 : 0) + (back ? (opp.goals === 0 ? 0.55 : -0.22 * Math.min(4, opp.goals)) : (s.goals - 1.3) * 0.08));
      r += share * ((st.p.ovr - 72) * 0.012 + normal(0, 0.32));
      st.rt = clamp(Math.round(r * 10) / 10, 3, 10);
    }
  }
  const eligible = all.filter((s) => s.min >= 30);
  const mom = (eligible.length ? eligible : all).sort((a, b) => b.rt - a.rt)[0]?.id ?? 0;

  const result: GameResult = {
    hs: H.goals, as: A.goals, et, pen,
    shH: H.shots, shA: A.shots, onH: H.onT, onA: A.onT,
    xgH: Math.round(H.xg * 100) / 100, xgA: Math.round(A.xg * 100) / 100,
    posH: possN ? possH / possN : 0.5,
    events, mom, shotsMap, injuries, momentum,
  };
  return { result, players: all, home, away };
}

export const keeperQuality = (g: Player) => keeperOvr(g.r as KeeperAttrs);
export { familiarity };
