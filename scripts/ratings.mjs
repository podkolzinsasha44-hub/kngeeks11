// Rating formulas shared by the data scripts (build-world.mjs, build-ucl.mjs): one place, so every
// player of the snapshot is rated the same way.
import fs from 'node:fs';

export const TODAY = '2026-07-20';

export function readCsv(file) {
  const s = fs.readFileSync(file, 'utf8');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const h = rows.shift();
  return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Deterministic pseudo-random number 0..1 for (key, salt). */
export const rnd = (key, salt) => (hash(`${key}:${salt}`) % 100000) / 100000;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const ageOn = (bd, date = TODAY) => {
  const [y, m, d] = bd.split('-').map(Number), [Y, M, D] = date.split('-').map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
};

const TPL = {
  // pac sho pas dri att def phy hea
  ST: [2, 5, -4, 0, 5, -32, 2, 2], LW: [6, 0, 1, 5, 2, -28, -6, -12], RW: [6, 0, 1, 5, 2, -28, -6, -12], LM: [5, -3, 3, 4, 0, -16, -4, -10], RM: [5, -3, 3, 4, 0, -16, -4, -10],
  AM: [1, 1, 5, 5, 4, -26, -7, -10], CM: [-1, -4, 4, 2, -1, -4, 0, -4], DM: [-2, -10, 2, -3, -8, 5, 4, 1], LB: [5, -16, 0, 1, -6, 2, -1, -4], RB: [5, -16, 0, 1, -6, 2, -1, -4],
  CB: [-3, -26, -5, -10, -18, 5, 5, 5],
};
const W = {
  ST: [0.14, 0.26, 0.08, 0.14, 0.24, 0, 0.08, 0.06], LW: [0.2, 0.14, 0.16, 0.22, 0.18, 0.04, 0.04, 0.02], RW: [0.2, 0.14, 0.16, 0.22, 0.18, 0.04, 0.04, 0.02],
  LM: [0.18, 0.1, 0.2, 0.2, 0.14, 0.1, 0.06, 0.02], RM: [0.18, 0.1, 0.2, 0.2, 0.14, 0.1, 0.06, 0.02], AM: [0.1, 0.14, 0.24, 0.2, 0.22, 0.04, 0.04, 0.02],
  CM: [0.08, 0.08, 0.26, 0.14, 0.12, 0.18, 0.1, 0.04], DM: [0.08, 0.03, 0.2, 0.08, 0.05, 0.34, 0.16, 0.06], LB: [0.2, 0.02, 0.14, 0.1, 0.08, 0.3, 0.1, 0.06],
  RB: [0.2, 0.02, 0.14, 0.1, 0.08, 0.3, 0.1, 0.06], CB: [0.1, 0, 0.08, 0.04, 0.01, 0.44, 0.19, 0.14],
};
export const TIER = { RPL: 65, FNL: 58, EPL: 74, ESP: 73, ITA: 72, GER: 72, FRA: 70 };
/** Rating of a player: from his market value, or (without one) from the level of his club or league. */
export function targetOvr(p, teamMv = new Map()) {
  const a = ageOn(p.bd);
  let base;
  if (p.mv > 0) {
    const v = Math.max(p.mv, 25_000);
    base = v <= 1e7 ? 58 + 10 * Math.log10(v / 1e5) : 78 + 13 * Math.log10(v / 1e7);
    base += a < 23 ? -0.9 * Math.min(5, 23 - a) : a > 28 ? Math.min(7, a - 28) : 0;
    if (p.role === 'GK') base += 2;
  } else {
    // No valuation: level of the club's squad (or the league), a normal age curve and a spread by player.
    const mvs = p.team ? teamMv.get(p.team) : null;
    let lvl = p.lg ? TIER[p.lg] - 4 : p.wc ? 64 + Math.min(7, p.caps / 9) : 60;
    if (mvs && mvs.length >= 8) {
      const med = [...mvs].sort((x, y) => x - y)[Math.floor(mvs.length * 0.3)];
      lvl = Math.min(lvl + 3, 58 + 10 * Math.log10(Math.max(med, 25_000) / 1e5) - 2);
    }
    base = lvl + (a < 21 ? -(21 - a) * 1.6 : a > 33 ? -(a - 33) : 0) + (rnd(p.id, 'lvl') - 0.5) * 6;
  }
  // Regular minutes last season are a small sign of quality on top of the valuation.
  const last = (p.hist ?? []).filter((h) => h.season === 2025).reduce((s, h) => s + h.min, 0);
  if (p.tm) base += last >= 2200 ? 0.8 : last < 300 && a > 22 ? -1 : 0;
  return clamp(Math.round(base), 45, 95);
}

/** Attributes around the rating, shaped by role, age, height and per-90 output of the last seasons. */
export function buildAttrs(p, ovr) {
  const a = ageOn(p.bd);
  const n = (k, amp = 4) => (rnd(p.id, k) - 0.5) * 2 * amp;
  if (p.role === 'GK') {
    const r = [ovr + n('ref'), ovr + n('pos'), ovr + n('han'), ovr - 8 + n('kic', 7), ovr + n('con') + (a >= 30 ? 2 : a < 24 ? -3 : 0), ovr + n('men') + (a >= 30 ? 2 : 0), 82 + n('sta')];
    const calc = () => 0.3 * r[0] + 0.28 * r[1] + 0.16 * r[2] + 0.06 * r[3] + 0.12 * r[4] + 0.08 * r[5];
    for (let i = 0; i < 4; i++) { const d = ovr - calc(); for (let k = 0; k < 6; k++) r[k] += d; }
    return r.map((x) => clamp(Math.round(x), 25, 99));
  }
  const t = TPL[p.role], w = W[p.role];
  const hs = (p.hist ?? []).filter((h) => h.season >= 2024);
  const min = hs.reduce((s, h) => s + h.min, 0), g = hs.reduce((s, h) => s + h.g, 0), as = hs.reduce((s, h) => s + h.a, 0), yc = hs.reduce((s, h) => s + h.yc + 2 * h.rc, 0);
  const per90 = (x) => (min >= 900 ? (x * 90) / min : null);
  const exp = { ST: [0.45, 0.14], LW: [0.26, 0.2], RW: [0.26, 0.2], AM: [0.22, 0.22], LM: [0.14, 0.17], RM: [0.14, 0.17], CM: [0.09, 0.12], DM: [0.04, 0.07], LB: [0.03, 0.1], RB: [0.03, 0.1], CB: [0.04, 0.03] }[p.role];
  const gd = per90(g) == null ? 0 : clamp((per90(g) - exp[0]) * 22, -4, 5);
  const ad = per90(as) == null ? 0 : clamp((per90(as) - exp[1]) * 26, -4, 5);
  const ht = p.ht ?? 181;
  const r = [
    ovr + t[0] + n('pac', 5) + (a > 30 ? -(a - 30) * 1.3 : a < 24 ? 1.5 : 0) - (ht - 182) * 0.12,
    ovr + t[1] + n('sho') + gd,
    ovr + t[2] + n('pas') + ad + (a > 30 ? 1 : 0),
    ovr + t[3] + n('dri') - (ht - 182) * 0.1,
    ovr + t[4] + n('att') + gd * 0.6 + (a > 30 ? 1 : 0),
    ovr + t[5] + n('def'),
    ovr + t[6] + n('phy') + (ht - 182) * 0.3 + (a < 21 ? -3 : 0),
    ovr + t[7] + n('hea', 5) + (ht - 182) * 0.5,
  ];
  const calc = () => r.reduce((s, x, i) => s + w[i] * clamp(x, 20, 99), 0);
  for (let i = 0; i < 5; i++) { const d = ovr - calc(); for (let k = 0; k < 8; k++) if (w[k] > 0.03) r[k] += d; }
  const dis = clamp(74 - (per90(yc) == null ? 0 : (per90(yc) - 0.2) * 55) + n('dis', 6), 35, 95);
  const sta = clamp(70 + n('sta', 8) + (min > 4500 ? 8 : min > 2500 ? 4 : 0) + (a > 32 ? -(a - 32) * 2 : 0) + ({ CM: 4, DM: 4, LB: 4, RB: 4, LM: 3, RM: 3 }[p.role] ?? 0), 40, 96);
  return [...r, dis, sta].map((x) => clamp(Math.round(x), 20, 99));
}
