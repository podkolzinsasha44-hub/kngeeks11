import { LEAGUES } from '../engine/leagues';
import type { League, Player, Pos, Role, Team } from '../engine/types';
import { ageOn, seasonLabel } from '../engine/util';

export { money, seasonLabel, dispName, dispShort } from '../engine/util';
export { nationName } from '../engine/intl';
import { flag as emojiFlag } from '../engine/intl';

// Windows has no flag emoji in its system font: there the three-letter country code is shown instead.
const HAS_FLAGS = typeof navigator === 'undefined' || !/Windows/i.test(navigator.userAgent);
export const flag = (c: string) => (HAS_FLAGS ? emojiFlag(c) : c);

/** Money step for sliders and ± buttons: about 1/25 of the amount, rounded down to 1, 2 or 5 × 10ⁿ. */
export function moneyStep(amount: number, min = 500) {
  const raw = Math.max(min, amount / 25);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * pow;
}

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

/**
 * Player cards in the manner of FIFA Ultimate Team. Every player has one: the rating gives the base edition
 * (bronze, silver, gold, rare gold, epic, star, world class), achievements give a special one on top of it.
 * Shares of the rating editions among the 6 523 players at the start: world class 0.9%, star 1.7%, epic 4.7%,
 * rare gold 9.9%, gold 22.5%, silver 38%, bronze 22.6%.
 */
export const TIERS = {
  // Special editions (achievements), from the rarest.
  icon: { min: Infinity, name: 'Легенда', color: '#f1d98a', why: 'ветеран от 34 лет с рейтингом 81+ или завершивший карьеру мастер' },
  toty: { min: Infinity, name: 'Команда года', color: '#6f9bff', why: 'игрок сезона в своей лиге' },
  ucl: { min: Infinity, name: 'Лига чемпионов', color: '#8fb4ff', why: 'победитель Лиги чемпионов' },
  tots: { min: Infinity, name: 'Команда сезона', color: '#42e6d2', why: 'награда лиги по итогам сезона' },
  hero: { min: Infinity, name: 'Герой клуба', color: '#ff6b81', why: 'четыре сезона и больше в вашем клубе' },
  future: { min: Infinity, name: 'Будущая звезда', color: '#a6ff4d', why: 'до 21 года, потенциал 80+' },
  // Rating editions.
  world: { min: 90, name: 'Мировой класс', color: '#ff8ad8', why: 'рейтинг 90+' },
  star: { min: 87, name: 'Звезда', color: '#ffd76a', why: 'рейтинг 87–89' },
  epic: { min: 84, name: 'Эпик', color: '#c58bff', why: 'рейтинг 84–86' },
  rare: { min: 80, name: 'Редкое золото', color: '#5fd4ff', why: 'рейтинг 80–83' },
  gold: { min: 75, name: 'Золото', color: '#e8c26a', why: 'рейтинг 75–79' },
  silver: { min: 68, name: 'Серебро', color: '#c3cbd9', why: 'рейтинг 68–74' },
  bronze: { min: 0, name: 'Бронза', color: '#d4925f', why: 'рейтинг до 68' },
} as const;
export type Tier = keyof typeof TIERS;
const TIER_ORDER = Object.keys(TIERS) as Tier[];
/** Edition by rating alone. */
export const tierOf = (ovr: number): Tier => TIER_ORDER.find((t) => ovr >= TIERS[t].min) ?? 'bronze';
export const SPECIAL: Tier[] = ['icon', 'toty', 'ucl', 'tots', 'hero', 'future'];

/** The card a player has now: a special edition for achievements, otherwise the edition of his rating. */
export function cardOf(L: League, p: Player): Tier {
  const age = ageOn(p.bd, L.date);
  const peak = p.hist.reduce((m, h) => Math.max(m, h[1]), p.ovr);
  if ((p.st === 'RET' && peak >= 80) || (age >= 34 && peak >= 81)) return 'icon';
  // Awards of the season just finished (or being finished) stay on the card for a year.
  const recent = [seasonLabel(L.season), seasonLabel(L.season - 1)];
  const won = p.awards.filter((a) => recent.some((s) => a.startsWith(s)));
  if (won.some((a) => a.endsWith('игрок сезона'))) return 'toty';
  if (won.some((a) => a.includes('победитель Лиги чемпионов'))) return 'ucl';
  if (won.some((a) => a.includes(': лучший'))) return 'tots';
  if (p.team === L.user && p.joined != null && L.season - p.joined >= 4) return 'hero';
  if (age <= 21 && p.pot >= 80 && p.pot - p.ovr >= 8) return 'future';
  return tierOf(p.ovr);
}
export const ovrColor = (ovr: number) => TIERS[tierOf(ovr)].color;

export function phaseLabel(L: League) {
  const t = L.teams[L.user];
  const c = L.comps[t.lg];
  if (L.intl.current && L.intl.current.phase !== 'upcoming') return L.intl.current.name;
  if (c.phase === 'preseason') return 'Предсезонка';
  if (c.phase === 'regular') return `${LEAGUES[t.lg].short} · ${t.rec.gp}-й тур позади`;
  return 'Межсезонье';
}

export const teamName = (L: League, id: string | null | undefined) => (id ? (L.teams[id] ?? L.ext?.[id])?.ru ?? '—' : '—');
export const recordStr = (t: Team) => `${t.rec.w}–${t.rec.d}–${t.rec.l}`;
export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
/** Where the player is right now, for lists. */
export function clubLabel(L: League, p: Player) {
  if (p.st === 'RET') return 'Завершил карьеру';
  if (p.team) return L.teams[p.team].ru;
  if (p.ext) return Object.values(L.ext ?? {}).find((t) => t.name === p.ext)?.ru ?? p.ext;
  return 'Свободный агент';
}
export const fitColor = (f: number) => (f >= 85 ? '#3ddc97' : f >= 70 ? '#ffb547' : '#ff5a5f');

/** Player photo on the Transfermarkt CDN: 'original' (631×820) for the profile card, 'big' (300×390), 'header' (139×181) for lists. */
export const photoUrl = (p: Player, size: 'original' | 'big' | 'header' = 'header') =>
  // Second League players: a full URL of the league's own site; everyone else: the Transfermarkt CDN.
  // A player the user created carries his own photo (a data URL kept in the save).
  p.img ? (p.img.startsWith('http') || p.img.startsWith('data:') || p.img.startsWith('./') ? p.img : `https://img.a.transfermarkt.technology/portrait/${size}/${p.img}?lm=1`) : null;

/** Scouts know their own players exactly; for others the potential is an estimate. */
export function potLabel(L: League, p: Player) {
  return p.team === L.user || playerAge(L, p) >= 27 ? `${p.pot}` : `${Math.max(p.ovr, p.pot - 3)}–${Math.min(99, p.pot + 3)}`;
}
