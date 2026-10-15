// Players the owner of the game asked to have in every career: real people who are not in any league's data,
// added with their consent. Each one joins the user's club once — in a new career and in an existing save —
// and is never re-added after the user sells or releases him.
import { createPlayer, type NewPlayer } from './gen';
import { getState, useState_ } from './rng';
import type { League } from './types';

interface Extra extends NewPlayer { key: string; age: number }

const EXTRAS: Extra[] = [
  {
    key: 'zhidkikh', fn: 'Савелий', ln: 'Жидких', role: 'LW', foot: 'L', age: 18, year: 0, ovr: 96, pot: 99,
    past: [{ club: 'Академия футбола', years: 2 }, { club: 'Академия им. Ю. П. Сёмина', years: 2 }],
    photo: './players/zhidkikh.jpg',
  },
];

export function addExtras(L: League) {
  if (!L.teams[L.user] || EXTRAS.every((e) => L.flags[`extra:${e.key}`])) return;
  useState_(L.rng);
  for (const e of EXTRAS) {
    const flag = `extra:${e.key}`;
    if (L.flags[flag]) continue;
    const year = Number(L.date.slice(0, 4)) - e.age;
    const p = createPlayer(L, { ...e, year });
    if (typeof p === 'string') continue; // a full squad: tried again on the next load
    // Exactly his age today: the birthday of this year is already behind.
    p.bd = `${year}-01-01`;
    p.made = undefined;
    p.extra = e.key;
    L.flags[flag] = true;
  }
  L.rng = getState();
}
