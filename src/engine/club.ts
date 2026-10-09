// The club behind the team: the weekly training plan and the facilities (medical centre, training ground, academy).
// AI clubs train normally and keep their facilities: every effect below is neutral at the defaults, so the world
// plays exactly as calibrated unless the user decides otherwise for his own club.
import { incidentsOf, LEAGUES } from './leagues';
import { injure } from './medical';
import { pushMsg } from './news';
import { next } from './rng';
import { squad } from './lineup';
import type { Facility, Intensity, League, OutfieldAttrs, Player, Team, TrainFocus } from './types';
import { addDays, ageOn, dispName, roundMoney } from './util';

export const INTENSITY: Record<Intensity, { label: string; sub: string; rec: number; grow: number; risk: number }> = {
  light: { label: 'Лёгкая', sub: 'Свежесть к матчам и никаких травм на тренировках, но игроки растут медленнее', rec: 4.3, grow: -0.45, risk: 0 },
  normal: { label: 'Обычная', sub: 'Привычная нагрузка: без травм на тренировках, обычный рост', rec: 3.4, grow: 0, risk: 0 },
  hard: { label: 'Интенсивная', sub: 'Игроки растут быстрее, но к матчу свежее не будут, а на тренировках случаются травмы', rec: 2.7, grow: 0.65, risk: 0.007 },
};

export const FOCUS: Record<TrainFocus, { label: string; sub: string; keys: (keyof OutfieldAttrs)[] }> = {
  balanced: { label: 'Всё понемногу', sub: 'Характеристики растут равномерно', keys: [] },
  physical: { label: 'Физика', sub: 'Скорость, мощь и выносливость; готовность восстанавливается быстрее', keys: ['pac', 'phy', 'sta'] },
  attack: { label: 'Атака', sub: 'Удар, игра в атаке, дриблинг и пас', keys: ['sho', 'att', 'dri', 'pas'] },
  defense: { label: 'Оборона', sub: 'Отбор, игра головой, мощь', keys: ['def', 'hea', 'phy'] },
};

export const trainingOf = (t: Pick<Team, 'training'> | null | undefined) => t?.training ?? { int: 'normal' as Intensity, focus: 'balanced' as TrainFocus };
export const facility = (t: Pick<Team, 'staff'>, k: Facility) => (k === 'train' ? t.staff.train ?? 2 : t.staff[k]);

/** Daily recovery of match fitness: training load, a physical focus and the training ground. */
export function recovery(L: League, p: Player): number {
  if (p.inj) return 1;
  const t = p.team ? L.teams[p.team] : null;
  if (!t || t.id !== L.user) return INTENSITY.normal.rec;
  const tr = trainingOf(t);
  return INTENSITY[tr.int].rec + (tr.focus === 'physical' ? 0.4 : 0) + (facility(t, 'train') - 2) * 0.15;
}

const TRAIN_INJ: [string, number, number][] = [['Перегрузка', 3, 8], ['Ушиб на тренировке', 2, 7], ['Растяжение мышцы бедра', 7, 21], ['Повреждение голеностопа', 7, 20]];

/** Monday: the week of training counts towards development; hard sessions now and then cost an injury. */
export function weeklyTraining(L: League) {
  const t = L.teams[L.user];
  if (!t) return;
  const tr = trainingOf(t);
  const week = INTENSITY[tr.int].grow + (facility(t, 'train') - 2) * 0.25;
  const risk = INTENSITY[tr.int].risk * incidentsOf(L).inj;
  for (const p of squad(L, t.id)) {
    if (p.inj) continue;
    if (week) p.trn = (p.trn ?? 0) + week;
    if (risk && next() < risk * (p.fit < 75 ? 1.5 : 1)) {
      const [type, lo, hi] = TRAIN_INJ[Math.floor(next() * TRAIN_INJ.length)];
      const days = injure(L, p, { type, days: Math.round(lo + (hi - lo) * next()) });
      pushMsg(L, { from: 'Медицинский штаб', kind: 'staff', title: `Травма на тренировке: ${dispName(p)}`, body: `${type}, около ${days} дн. Интенсивные тренировки ускоряют рост, но и травмируют чаще — нагрузку можно снизить в разделе «Клуб».`, ref: { type: 'player', id: p.id } });
    }
  }
}

/** Extra yearly growth (rating points) from the season's training; younger players gain most. */
export function trainingGrowth(L: League, p: Player): number {
  if (!p.trn) return 0;
  const age = ageOn(p.bd, L.date);
  const w = age <= 21 ? 1 : age <= 24 ? 0.8 : age <= 28 ? 0.5 : 0.35;
  // About 46 weeks of training in a season.
  return Math.max(-1, Math.min(1.6, p.trn / 46)) * w;
}

/** Attributes the club's training emphasised this season. */
export const focusKeys = (L: League, p: Player) => (p.team === L.user ? FOCUS[trainingOf(L.teams[L.user]).focus].keys : []);

// ----- Facilities --------------------------------------------------------------------------------

export const FACILITY: Record<Facility, { label: string; icon: string; sub: string; effect: (lvl: number) => string }> = {
  med: { label: 'Медицинский центр', icon: '🏥', sub: 'Игроки быстрее восстанавливаются после травм', effect: (l) => { const k = Math.round((1 - (1.15 - l * 0.075)) * 100); return k === 0 ? 'обычные сроки восстановления' : k > 0 ? `травмы короче на ${k}%` : `травмы длиннее на ${-k}%`; } },
  train: { label: 'Тренировочная база', icon: '🏋️', sub: 'Быстрее рост игроков и восстановление готовности', effect: (l) => (l === 2 ? 'обычный рост' : `${l > 2 ? '+' : '−'}${Math.abs((l - 2) * 0.25).toFixed(2)} к росту рейтинга молодых за сезон`) },
  academy: { label: 'Академия', icon: '🌱', sub: 'Больше и сильнее выпускники каждое лето', effect: (l) => `${l >= 3 ? '2–3' : '1–2'} выпускника, уровень +${(l * 1.5).toFixed(1)}` },
};
export const MAX_LEVEL = 5;
/** Days to build the next level. */
export const BUILD_DAYS = 90;

/** Price of the next level: grows with the level and the money of the league. */
export function upgradeCost(t: Team, k: Facility): number {
  const lvl = facility(t, k);
  const base = LEAGUES[t.lg]?.income ?? 1e6;
  return roundMoney(base * 0.07 * (lvl + 1) * (k === 'academy' ? 0.8 : 1));
}

/** Why the user cannot start building now, or null. */
export function upgradeBlock(L: League, k: Facility): string | null {
  const t = L.teams[L.user];
  if (t.build) return `Уже идёт стройка: ${FACILITY[t.build.kind].label.toLowerCase()} до ${t.build.done.split('-').reverse().join('.')}`;
  if (facility(t, k) >= MAX_LEVEL) return 'Достигнут максимальный уровень';
  const cost = upgradeCost(t, k);
  if (t.budget < cost) return 'Не хватает трансферного бюджета';
  return null;
}

export function startUpgrade(L: League, k: Facility): string {
  const block = upgradeBlock(L, k);
  if (block) return block;
  const t = L.teams[L.user];
  const cost = upgradeCost(t, k);
  t.budget -= cost;
  t.build = { kind: k, done: addDays(L.date, BUILD_DAYS), cost };
  return `Стройка началась: ${FACILITY[k].label.toLowerCase()}, уровень ${facility(t, k) + 1} — через ${BUILD_DAYS} дней`;
}

/** Finishes a construction whose day has come. */
export function dailyClub(L: League) {
  const t = L.teams[L.user];
  if (!t?.build || L.date < t.build.done) return;
  const k = t.build.kind;
  if (k === 'train') t.staff.train = (t.staff.train ?? 2) + 1;
  else t.staff[k]++;
  t.build = undefined;
  pushMsg(L, { from: 'Дирекция клуба', kind: 'staff', title: `${FACILITY[k].label}: уровень ${facility(t, k)}`, body: `Стройка завершена. Теперь: ${FACILITY[k].effect(facility(t, k))}.` });
}
