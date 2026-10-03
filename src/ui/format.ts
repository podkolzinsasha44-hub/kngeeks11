import { LEAGUES } from '../engine/leagues';
import type { League, Player, Pos, Role, Team } from '../engine/types';
import { ageOn } from '../engine/util';

export { money, seasonLabel, dispName, dispShort } from '../engine/util';
export { nationName } from '../engine/intl';
import { flag as emojiFlag } from '../engine/intl';

// Windows has no flag emoji in its system font: there the three-letter country code is shown instead.
const HAS_FLAGS = typeof navigator === 'undefined' || !/Windows/i.test(navigator.userAgent);
export const flag = (c: string) => (HAS_FLAGS ? emojiFlag(c) : c);

export const POS_RU: Record<Pos, string> = { G: 'Вр', D: 'Защ', M: 'ПЗ', F: 'Нап' };
export const POS_FULL: Record<Pos, string> = { G: 'Вратари', D: 'Защитники', M: 'Полузащитники', F: 'Нападающие' };
export const ROLE_RU: Record<Role, string> = { GK: 'ВР', CB: 'ЦЗ', LB: 'ЛЗ', RB: 'ПЗ', DM: 'ОП', CM: 'ЦП', AM: 'АП', LM: 'ЛП', RM: 'ПП', LW: 'ЛВ', RW: 'ПВ', ST: 'НАП' };
export const ROLE_FULL: Record<Role, string> = {
  GK: 'Вратарь', CB: 'Центральный защитник', LB: 'Левый защитник', RB: 'Правый защитник', DM: 'Опорный полузащитник', CM: 'Центральный полузащитник',
  AM: 'Атакующий полузащитник', LM: 'Левый полузащитник', RM: 'Правый полузащитник', LW: 'Левый вингер', RW: 'Правый вингер', ST: 'Нападающий',
};
export const ATTR_RU: Record<string, string> = {
  pac: 'Скорость', sho: 'Удар', pas: 'Пас', dri: 'Дриблинг', att: 'Игра в атаке', def: 'Оборона', phy: 'Физика', hea: 'Игра головой', dis: 'Дисциплина', sta: 'Выносливость',
  ref: 'Реакция', pos: 'Выбор позиции', han: 'Игра руками', kic: 'Игра ногами', con: 'Стабильность', men: 'Психология',
};
export const ATTR_SHORT: Record<string, string> = {
  pac: 'СКО', sho: 'УДР', pas: 'ПАС', dri: 'ДРИ', att: 'АТК', def: 'ОБР', phy: 'ФИЗ', hea: 'ГОЛ', dis: 'ДИС', sta: 'ВЫН',
  ref: 'РЕА', pos: 'ПОЗ', han: 'РУК', kic: 'НОГ', con: 'СТБ', men: 'ПСИ',
};
export const FOOT_RU = { L: 'левая', R: 'правая', B: 'обе' };

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export const dateShort = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
export const dateLong = (iso: string) => `${Number(iso.slice(8))} ${MONTHS_FULL[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
export const dowRu = (iso: string) => DOW[new Date(iso + 'T12:00:00Z').getUTCDay()];

export const playerAge = (L: League, p: Player) => ageOn(p.bd, L.date);

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function ovrColor(ovr: number) {
  if (ovr >= 88) return '#ff8ad8';
  if (ovr >= 82) return '#e8c26a';
  if (ovr >= 75) return '#3ddc97';
  if (ovr >= 68) return '#7fd3ff';
  if (ovr >= 60) return '#c3cbd9';
  return '#8b98ae';
}
export function tierOf(ovr: number): 'legend' | 'elite' | 'gold' | 'silver' | 'bronze' {
  return ovr >= 90 ? 'legend' : ovr >= 84 ? 'elite' : ovr >= 76 ? 'gold' : ovr >= 66 ? 'silver' : 'bronze';
}
export const TIER_RU = { legend: 'Легенда', elite: 'Элита', gold: 'Золото', silver: 'Серебро', bronze: 'Бронза' };

export function phaseLabel(L: League) {
  const t = L.teams[L.user];
  const c = L.comps[t.lg];
  if (L.intl.current && L.intl.current.phase !== 'upcoming') return L.intl.current.name;
  if (c.phase === 'preseason') return 'Предсезонная подготовка';
  if (c.phase === 'regular') return `${LEAGUES[t.lg].short} · ${t.rec.gp}-й тур позади`;
  return 'Межсезонье';
}

export const teamName = (L: League, id: string | null | undefined) => (id && L.teams[id] ? L.teams[id].ru : '—');
export const recordStr = (t: Team) => `${t.rec.w}–${t.rec.d}–${t.rec.l}`;
export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
/** Where the player is right now, for lists. */
export function clubLabel(L: League, p: Player) {
  if (p.st === 'RET') return 'Завершил карьеру';
  if (p.team) return L.teams[p.team].ru;
  if (p.ext) return p.ext;
  return 'Свободный агент';
}
export const fitColor = (f: number) => (f >= 85 ? '#3ddc97' : f >= 70 ? '#ffb547' : '#ff5a5f');
