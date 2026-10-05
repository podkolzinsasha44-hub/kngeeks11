// Adds the youth league of players born in 2009 (Oryol and the neighbouring regions) to
// public/data/world.json (run after build-world.mjs).
//
// Only the clubs are written here. Their players are minors: no real names or birth dates are
// collected or shipped. The game creates placeholder squads (marked as fictional) and the user can
// type in the real squad of his own team on his phone (it stays in his save, see src/engine/youth.ts).
// The list of opponents is a starting point and can be renamed in the game.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORLD = path.join(ROOT, 'public', 'data', 'world.json');

const CLUBS = [
  ['RUS09', 'DYuSSh-3 Rusichi 2009', 'ДЮСШ-3 «Русичи» 2009', 'Орёл', '#00923E', '#FFFFFF', 'Академия футбола Юрия Сёмина'],
  ['AVK09', 'Avangard Kursk 2009', '«Авангард» 2009', 'Курск', '#C8102E', '#FFFFFF', ''],
  ['SLB09', 'Salyut Belgorod 2009', '«Салют» 2009', 'Белгород', '#E30613', '#FFFFFF', ''],
  ['MLP09', 'Metallurg Lipetsk 2009', '«Металлург» 2009', 'Липецк', '#0A4DA2', '#FFFFFF', ''],
  ['SPT09', 'Spartak Tambov 2009', '«Спартак» 2009', 'Тамбов', '#D3202B', '#FFFFFF', ''],
  ['FKV09', 'Fakel Voronezh 2009', '«Факел» 2009', 'Воронеж', '#1F4E9C', '#FFFFFF', ''],
  ['DBR09', 'Dynamo Bryansk 2009', '«Динамо» 2009', 'Брянск', '#0B63C5', '#FFFFFF', ''],
  ['ART09', 'Arsenal Tula 2009', '«Арсенал» 2009', 'Тула', '#D4202C', '#F5C400', ''],
];

const world = JSON.parse(fs.readFileSync(WORLD, 'utf8'));
const taken = new Set(world.teams.filter((t) => t.lg !== 'U17').map((t) => t.id));
const teams = CLUBS.map(([id, name, ru, city, primary, secondary, note]) => {
  if (taken.has(id)) throw new Error(`Id ${id} is taken`);
  return {
    id, lg: 'U17', name, ru, short: id.slice(0, 3), country: 'RUS', primary, secondary, stadium: note ? `${note}, ${city}` : `Стадион спортшколы, ${city}`, cap: 1500,
    rep: 10, coach: { name: 'Главный тренер', rating: 52 }, budget: 0, wages: 0, city,
  };
});
world.teams = world.teams.filter((t) => t.lg !== 'U17').concat(teams);
world.leagues.U17 = { name: 'Юношеская лига 2009 г. р.', country: 'RUS', tier: 9, teams: teams.map((t) => t.id) };
world.facts.champions.U17 = null;
fs.writeFileSync(WORLD, JSON.stringify(world));
console.log(`Youth league 2009: ${teams.length} clubs (${teams.map((t) => t.ru).join(', ')})`);
