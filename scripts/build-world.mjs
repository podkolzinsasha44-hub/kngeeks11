// Builds public/data/world.json from the raw snapshot (npm run data:fetch first).
//
//  * Who plays where: current squads of the 128 clubs of the seven simulated leagues (Wikipedia,
//    September 2026) and the squads of the 2026 World Cup.
//  * Who the players are: date of birth, position, foot, height, market value, contract end and
//    three seasons of appearances from the open transfermarkt-datasets snapshot (CC0), matched by
//    date of birth and name.
//  * Ratings: market value (age-adjusted) sets the overall level, position and real statistics
//    shape the attributes. Wages are a model — real salaries are not public.
//
// Every player in the output is a real person. Nothing here is random: the same input gives the
// same world.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { LEAGUES, cached, enSquad, link, templates, tplParams } from './fetch-data.mjs';
import { COUNTRIES, fifa, flagEmoji } from './countries.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const TODAY = '2026-07-20';

// ---------------------------------------------------------------- helpers
function readCsv(file) {
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
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Deterministic pseudo-random number 0..1 for (key, salt). */
const rnd = (key, salt) => (hash(`${key}:${salt}`) % 100000) / 100000;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const SPECIAL = { ø: 'o', đ: 'd', ł: 'l', ß: 'ss', æ: 'ae', ı: 'i', œ: 'oe', ð: 'd', þ: 'th' };
const norm = (s) => (s ?? '').toLowerCase().replace(/[øđłßæıœðþ]/g, (c) => SPECIAL[c]).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Collapses transliteration variants: Yerokhin/Erokhin, Karavayev/Karavaev, Aleksandr/Alexander. */
const canon = (s) => norm(s)
  .replace(/dzh/g, 'j').replace(/kh/g, 'h').replace(/ks/g, 'x').replace(/ts/g, 'c').replace(/ph/g, 'f').replace(/ou/g, 'u').replace(/w/g, 'v')
  .replace(/y[oe]/g, 'e').replace(/yu/g, 'u').replace(/ya/g, 'a').replace(/i[yj]/g, 'i').replace(/[yj]/g, 'i').replace(/ie/g, 'e').replace(/ei/g, 'e')
  .replace(/(.)\1+/g, '$1');
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m + n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const ratio = (a, b) => (a.length || b.length ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0);
function nameSim(a, b) {
  const ca = canon(a), cb = canon(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  const ta = ca.split(' '), tb = cb.split(' ');
  const full = ratio(ca, cb);
  const last = ratio(ta[ta.length - 1], tb[tb.length - 1]);
  const first = ta[0][0] === tb[0][0] ? 1 : 0;
  // One-name players ("Pedro") against full names ("Pedro Henrique Silva").
  const sub = ta.length === 1 || tb.length === 1 ? (tb.includes(ta[0]) || ta.includes(tb[0]) ? 0.8 : 0) : 0;
  const anyTok = ta.some((x) => x.length > 3 && tb.includes(x)) ? 0.62 : 0;
  return Math.max(full, last * 0.8 + first * 0.2 - (ta.length > 1 && tb.length > 1 && !first ? 0.25 : 0), sub, anyTok);
}
const ageOn = (bd, date = TODAY) => {
  const [y, m, d] = bd.split('-').map(Number), [Y, M, D] = date.split('-').map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
};

// ---------------------------------------------------------------- raw data
console.log('Reading the dataset…');
const tmPlayers = readCsv(path.join(RAW, 'tm', 'players.csv'));
const tmClubs = new Map(readCsv(path.join(RAW, 'tm', 'clubs.csv')).map((c) => [c.club_id, c]));
const wd = JSON.parse(fs.readFileSync(path.join(RAW, 'wikidata.json'), 'utf8'));
const leaguesRaw = JSON.parse(fs.readFileSync(path.join(RAW, 'leagues.json'), 'utf8'));

const tmById = new Map(), tmByDob = new Map(), tmByName = new Map(), tmByNat = new Map();
for (const p of tmPlayers) {
  p.dob = p.date_of_birth.slice(0, 10);
  p.nat = fifa(p.country_of_citizenship);
  p.mv = Number(p.market_value_in_eur) || 0;
  p.ls = Number(p.last_season) || 0;
  tmById.set(p.player_id, p);
  if (p.dob) (tmByDob.get(p.dob) ?? tmByDob.set(p.dob, []).get(p.dob)).push(p);
  const k = norm(p.name);
  (tmByName.get(k) ?? tmByName.set(k, []).get(k)).push(p);
  if (p.ls >= 2022) (tmByNat.get(p.nat) ?? tmByNat.set(p.nat, []).get(p.nat)).push(p);
}
const taken = new Set();

/** Finds the dataset record of a squad player. */
function matchTM({ name, page, nat, dob, year }) {
  const alt = page ? page.replace(/\s*\([^)]*\)\s*$/, '') : name;
  const sim = (p) => Math.max(nameSim(name, p.name), nameSim(alt, p.name));
  const free = (p) => !taken.has(p.player_id);
  if (dob && !dob.endsWith('-00-00') && !dob.endsWith('-01-01')) {
    const c = (tmByDob.get(dob) ?? []).filter(free).map((p) => ({ p, s: sim(p) + (p.nat === nat ? 0.15 : 0) })).sort((a, b) => b.s - a.s);
    if (c[0] && c[0].s >= 0.55) return c[0].p;
  }
  const y = dob ? Number(dob.slice(0, 4)) : year;
  const okYear = (p) => !y || !p.dob || Math.abs(Number(p.dob.slice(0, 4)) - y) <= (dob ? 0 : 1);
  for (const key of new Set([norm(name), norm(alt)])) {
    let c = (tmByName.get(key) ?? []).filter((p) => free(p) && okYear(p));
    if (c.length > 1) { const n = c.filter((p) => p.nat === nat); if (n.length) c = n; }
    if (c.length > 1) c = [c.sort((a, b) => b.ls - a.ls || b.mv - a.mv)[0]];
    if (c.length === 1 && (y || c[0].nat === nat || !nat)) return c[0];
  }
  if (y) {
    let best = null, bs = 0;
    for (const p of tmByNat.get(nat) ?? []) {
      if (!free(p) || !p.dob || Number(p.dob.slice(0, 4)) !== y) continue;
      const s = sim(p);
      if (s > bs) { bs = s; best = p; }
    }
    if (best && bs >= 0.86) return best;
  }
  return null;
}

// ---------------------------------------------------------------- clubs
const RU_COLORS = {
  'FC Zenit Saint Petersburg': ['#0E86D4', '#FFFFFF'], 'FC Spartak Moscow': ['#D3202B', '#FFFFFF'], 'PFC CSKA Moscow': ['#C8102E', '#0A3A8C'],
  'FC Lokomotiv Moscow': ['#00843D', '#D22630'], 'FC Dynamo Moscow': ['#0B63C5', '#FFFFFF'], 'FC Krasnodar': ['#0B5D33', '#111111'],
  'FC Rostov': ['#F6C400', '#0057B8'], 'FC Rubin Kazan': ['#8A1538', '#0E7C3A'], 'FC Akhmat Grozny': ['#0E8A43', '#FFFFFF'],
  'PFC Krylia Sovetov Samara': ['#008C45', '#1E5AA8'], 'FC Orenburg': ['#1565C0', '#FFFFFF'], 'FC Akron Tolyatti': ['#D2202F', '#111111'],
  'FC Baltika Kaliningrad': ['#0A6CC4', '#FFFFFF'], 'FC Dynamo Makhachkala': ['#1456B8', '#FFFFFF'], 'FC Fakel Voronezh': ['#1F4E9C', '#FFFFFF'],
  'FC Rodina Moscow': ['#C8102E', '#FFFFFF'], 'FC Arsenal Tula': ['#D4202C', '#F5C400'], 'FC Chelyabinsk': ['#F28C00', '#111111'],
  'FC KAMAZ Naberezhnye Chelny': ['#0057B8', '#FFFFFF'], 'FC Leningradets Leningrad Oblast': ['#1E3A8A', '#FFFFFF'], 'FC Neftekhimik Nizhnekamsk': ['#0A8F4A', '#FFFFFF'],
  'FC Nizhny Novgorod': ['#1E4FA3', '#FFFFFF'], 'FC Rotor Volgograd': ['#0A8FD6', '#0B3B8C'], 'FC Shinnik Yaroslavl': ['#1A1A1A', '#1E64C8'],
  'FC SKA-Khabarovsk': ['#C8102E', '#1E3A8A'], 'PFC Sochi': ['#0A66C2', '#FFFFFF'], 'FC Spartak Kostroma': ['#D3202B', '#FFFFFF'],
  'FC Tekstilshchik Ivanovo': ['#C8102E', '#111111'], 'FC Torpedo Moscow': ['#1A1A1A', '#FFFFFF'], 'FC Ufa': ['#0A8F4A', '#C8102E'],
  'FC Ural Yekaterinburg': ['#F28C00', '#111111'], 'FC Veles Moscow': ['#5B2A86', '#111111'], 'FC Volga Ulyanovsk': ['#1E64C8', '#FFFFFF'],
  'FC Yenisey Krasnoyarsk': ['#C8102E', '#1E3A8A'],
};
const PALETTE = [['#C8102E', '#FFFFFF'], ['#0B63C5', '#FFFFFF'], ['#0E8A43', '#FFFFFF'], ['#F6C400', '#111111'], ['#111111', '#FFFFFF'], ['#7A1FA2', '#FFFFFF'], ['#F28C00', '#111111'], ['#00A3A3', '#FFFFFF'], ['#8A1538', '#F5C400']];
const LG_INFO = {
  RPL: { name: 'Российская Премьер-Лига', country: 'RUS', tier: 1 },
  FNL: { name: 'Первая лига', country: 'RUS', tier: 2 },
  EPL: { name: 'Премьер-лига (Англия)', country: 'ENG', tier: 1 },
  ESP: { name: 'Ла Лига', country: 'ESP', tier: 1 },
  ITA: { name: 'Серия A', country: 'ITA', tier: 1 },
  GER: { name: 'Бундеслига', country: 'GER', tier: 1 },
  FRA: { name: 'Лига 1', country: 'FRA', tier: 1 },
};
const hex = (s) => (/^[0-9a-f]{6}$/i.test((s ?? '').trim()) ? '#' + s.trim().toUpperCase() : null);
const cleanRu = (t) => (t ?? '').replace(/\s*\([^)]*\)\s*/g, '').trim();
function infobox(text) {
  const i = text.search(/\{\{\s*Infobox football club/i);
  const box = i >= 0 ? text.slice(i, i + 6000) : '';
  const get = (k) => (box.match(new RegExp(`\\|\\s*${k}\\s*=([^\\n]*)`, 'i')) ?? [])[1]?.trim() ?? '';
  return get;
}

const teams = [], players = [], teamByPage = new Map(), usedIds = new Set();
const squadsRaw = [];
for (const lg of LEAGUES) {
  for (const c of leaguesRaw[lg.id]) {
    const w = cached('en', c.page);
    if (!w?.text) continue;
    let id = c.code.normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (let n = 2; usedIds.has(id); n++) id = `${c.code.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3)}${n}`;
    usedIds.add(id);
    const get = infobox(w.text);
    const col = RU_COLORS[w.title] ?? (hex(get('body1')) ? [hex(get('body1')), hex(get('shorts1')) ?? hex(get('leftarm1')) ?? '#FFFFFF'] : PALETTE[hash(w.title) % PALETTE.length]);
    if (col[0] === '#FFFFFF') col.reverse();
    if (col[0] === col[1]) col[1] = col[0] === '#FFFFFF' ? '#111111' : '#FFFFFF';
    const cap = Number((get('capacity').match(/[\d,. ]{4,}/) ?? ['0'])[0].replace(/[^\d]/g, '')) || 15000;
    const coach = link(get('manager') || get('coach') || get('head coach')).text.replace(/\(.*$/, '').trim();
    const ru = cleanRu(c.ru) || c.short;
    const cityM = /(([^)]*))/.exec(c.ru ?? '');
    const ruCity = cityM ? cityM[1].split(',').pop().trim() : '';
    const t = {
      id, lg: lg.id, name: c.short, ru, short: c.code.slice(0, 3), city: '', country: LG_INFO[lg.id].country,
      primary: col[0], secondary: col[1], stadium: link(get('ground')).text || 'Стадион', cap, coach: coach || null, page: w.title, ruCity: /клуб/i.test(ruCity) ? '' : ruCity,
    };
    teams.push(t);
    teamByPage.set(w.title, t);
    teamByPage.set(c.page, t);
    // Russian article: Cyrillic names and birth years by shirt number
    const ruSq = new Map();
    const rw = c.ru ? cached('ru', c.ru) : null;
    if (rw?.text) {
      const k = rw.text.search(/\{\{\s*Состав\s*\}\}/i);
      const blk = k >= 0 ? rw.text.slice(k, k + 9000).split(/\n==/)[0] : '';
      for (const { body } of templates(blk, 'Игрок')) {
        const { pos } = tplParams(body);
        const no = Number(pos[0]);
        const l = link(pos[3]);
        const ruName = l.text.includes(',') ? l.text.split(',').reverse().map((x) => x.trim().split(' ')[0]).join(' ') : l.text;
        if (no) ruSq.set(no, { ru: ruName, year: Number(pos[5]) || null });
      }
    }
    squadsRaw.push({ t, squad: enSquad(w.text), ruSq });
  }
}
console.log(`Clubs: ${teams.length}`);

// ---------------------------------------------------------------- squads → players
const ROLE = {
  Goalkeeper: 'GK', 'Centre-Back': 'CB', 'Left-Back': 'LB', 'Right-Back': 'RB', 'Defensive Midfield': 'DM', 'Central Midfield': 'CM',
  'Attacking Midfield': 'AM', 'Left Midfield': 'LM', 'Right Midfield': 'RM', 'Left Winger': 'LW', 'Right Winger': 'RW', 'Centre-Forward': 'ST', 'Second Striker': 'ST',
};
const WIKI_ROLES = { GK: ['GK'], DF: ['CB', 'CB', 'RB', 'LB', 'CB'], MF: ['CM', 'DM', 'AM', 'CM', 'RM', 'LM'], FW: ['ST', 'RW', 'ST', 'LW'] };
let nextId = 9_000_000;
const byPage = new Map();
const stat = { squad: 0, matched: 0, noDob: 0, noYear: 0 };
const rot = {};

function mkPlayer(src) {
  const { tm, name, page, nat, wikiPos, no, team, ext, ruName, year, dobWiki, caps, goals } = src;
  const w = page ? wd[page] : null;
  let dob = tm?.dob || (dobWiki && !dobWiki.endsWith('-00-00') ? dobWiki : null) || (w?.bd && !w.bd.endsWith('-00-00') ? w.bd : null);
  let approx = false;
  if (!dob) {
    // Only the year of birth is known (or nothing at all): the date is marked as approximate.
    const y = year || Number(w?.bd?.slice(0, 4)) || null;
    if (!y) stat.noYear++;
    dob = `${y ?? 2000}-07-01`; approx = true; stat.noDob++;
  }
  if (Number.isNaN(Date.parse(dob))) dob = '1999-07-01';
  let role = tm ? ROLE[tm.sub_position] ?? null : null;
  const wp = (wikiPos ?? '').toUpperCase();
  if (!role || (wp === 'GK') !== (role === 'GK')) {
    const key = wp in WIKI_ROLES ? wp : tm?.position === 'Goalkeeper' ? 'GK' : tm?.position === 'Defender' ? 'DF' : tm?.position === 'Attack' ? 'FW' : 'MF';
    const k = `${team?.id ?? 'x'}:${key}`;
    rot[k] = (rot[k] ?? 0) + 1;
    role = WIKI_ROLES[key][(rot[k] - 1) % WIKI_ROLES[key].length];
  }
  const parts = name.split(' ');
  const fn = tm && norm(tm.name) === norm(name) ? tm.first_name : parts.length > 1 ? parts[0] : '';
  const ln = tm && norm(tm.name) === norm(name) ? tm.last_name || tm.name : parts.length > 1 ? parts.slice(1).join(' ') : name;
  let ru = ruName ?? w?.ru ?? null;
  if (ru) {
    ru = ru.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (ru.includes(',')) ru = ru.split(',').reverse().map((x) => x.trim().split(' ')[0]).join(' ');
    const tk = ru.split(' ');
    if (tk.length === 3 && /(вич|ич|оглы|улы)$/i.test(tk[1])) ru = `${tk[0]} ${tk[2]}`;
    if (!/[а-яё]/i.test(ru)) ru = null;
  }
  const id = tm ? Number(tm.player_id) : nextId++;
  const p = {
    id, fn, ln, ru, role, alt: tm?.sub_position === 'Second Striker' ? ['AM'] : undefined,
    foot: tm?.foot === 'left' ? 'L' : tm?.foot === 'both' ? 'B' : 'R',
    bd: dob, approx, ctry: fifa(nat || tm?.country_of_citizenship), ht: Number(tm?.height_in_cm) || w?.ht || null,
    num: no ?? null, team: team?.id ?? null, ext: team ? undefined : ext, mv: tm?.mv ?? 0,
    caps: caps ?? (Number(tm?.international_caps) || 0), ig: goals ?? (Number(tm?.international_goals) || 0),
    tmClub: tm?.current_club_id, until: tm?.contract_expiration_date ? tm.contract_expiration_date.slice(0, 10) : null, tm: !!tm, lg: team?.lg ?? null,
  };
  if (tm) taken.add(tm.player_id);
  players.push(p);
  if (page) byPage.set(page, p);
  return p;
}

for (const { t, squad, ruSq } of squadsRaw) {
  for (const e of squad) {
    if (e.page && byPage.has(e.page)) continue;
    const r = e.no ? ruSq.get(e.no) : null;
    const dobWiki = e.page ? wd[e.page]?.bd : null;
    const nat = fifa(e.nat);
    const tm = matchTM({ name: e.name, page: e.page, nat, dob: dobWiki, year: r?.year });
    stat.squad++;
    if (tm) stat.matched++;
    const p = mkPlayer({ tm, name: e.name, page: e.page, nat, wikiPos: e.pos, no: e.no, team: t, ruName: r?.ru, year: r?.year, dobWiki });
    if (e.loan) p.loanFrom = typeof e.loan === 'string' ? e.loan : '?';
  }
}
console.log(`Squad players: ${stat.squad}, matched with the dataset: ${stat.matched}`);

// Which dataset club is which of our clubs (by the majority of the squad).
const tmIdOfTeam = new Map();
for (const p of players) {
  if (!p.team || !p.tmClub) continue;
  const k = `${p.team}`;
  const m = tmIdOfTeam.get(k) ?? tmIdOfTeam.set(k, new Map()).get(k);
  m.set(p.tmClub, (m.get(p.tmClub) ?? 0) + 1);
}
const teamTm = new Map([...tmIdOfTeam].map(([t, m]) => [t, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
const tmToTeam = new Map([...teamTm].map(([t, c]) => [c, t]));

// ---------------------------------------------------------------- World Cup 2026 squads
const wcText = cached('en', '2026 FIFA World Cup squads').text;
const wc = { groups: {}, squads: {} };
{
  const heads = [...wcText.matchAll(/^(={2,3})\s*([^=\n]+?)\s*\1\s*$/gm)];
  let group = null;
  heads.forEach((h, i) => {
    if (h[1].length === 2) { group = /^Group ([A-L])$/.exec(h[2])?.[1] ?? null; return; }
    if (!group) return;
    const code = fifa(h[2]);
    (wc.groups[group] ??= []).push(code);
    const body = wcText.slice(h.index, heads[i + 1]?.index ?? wcText.length);
    wc.squads[code] = [];
    for (const { body: b } of templates(body, 'nat fs g player')) {
      const { named } = tplParams(b);
      const l = link(named.name);
      const a = /(\d{4})\|(\d{1,2})\|(\d{1,2})\s*$/.exec((named.age ?? '').replace(/\}\}\s*$/, ''));
      const dob = a ? `${a[1]}-${a[2].padStart(2, '0')}-${a[3].padStart(2, '0')}` : null;
      let p = l.page ? byPage.get(l.page) : null;
      if (!p) {
        const tm = matchTM({ name: l.text, page: l.page, nat: code, dob });
        // The player may already be in a club squad under a different article title.
        p = tm ? players.find((x) => x.id === Number(tm.player_id)) : players.find((x) => x.bd === dob && nameSim(`${x.fn} ${x.ln}`, l.text) > 0.7);
        if (!p) p = mkPlayer({ tm, name: l.text, page: l.page, nat: code, wikiPos: named.pos, ext: link(named.club).text || null, dobWiki: dob });
      }
      p.ctry = code;
      p.caps = Math.max(p.caps, Number(named.caps) || 0);
      p.ig = Math.max(p.ig, Number(named.goals) || 0);
      p.wc = true;
      wc.squads[code].push(p.id);
    }
  });
}
console.log(`World Cup 2026: ${Object.keys(wc.squads).length} squads, ${Object.values(wc.squads).flat().length} players`);

// ---------------------------------------------------------------- the rest of the world
let pool = 0;
for (const tm of tmPlayers) {
  if (taken.has(tm.player_id) || tm.ls < 2025 || !tm.dob) continue;
  const a = ageOn(tm.dob);
  if (a > 39) continue;
  const keep = tm.mv >= 2_500_000 || (tm.nat === 'RUS' && tm.mv >= 250_000) || (a <= 21 && tm.mv >= 1_200_000) || (['BLR', 'KAZ', 'ARM', 'UZB', 'GEO', 'SRB'].includes(tm.nat) && tm.mv >= 700_000);
  if (!keep) continue;
  // The snapshot of club membership is older than the squads: a player the dataset still lists at one of
  // our clubs has left it (he is not in its September squad).
  const stale = tmToTeam.has(tm.current_club_id);
  // Where he went is unknown, so he is left out rather than guessed.
  if (stale) continue;
  mkPlayer({ tm, name: tm.name, nat: tm.nat, ext: (tmClubs.get(tm.current_club_id)?.name ?? tm.current_club_name) || null });
  pool++;
}
console.log(`World pool: ${pool}. Total players: ${players.length}`);

// ---------------------------------------------------------------- statistics of three seasons
console.log('Reading appearances…');
const keep = new Map(players.filter((p) => p.tm).map((p) => [String(p.id), p]));
const agg = new Map();
{
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(RAW, 'tm', 'appearances.csv')) });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const c = line.slice(1, -1).split('","');
    const p = keep.get(c[2]);
    if (!p) continue;
    const y = Number(c[5].slice(0, 4)), m = Number(c[5].slice(5, 7));
    const season = m >= 7 ? y : y - 1;
    if (season < 2023) continue;
    const k = `${c[2]}:${season}:${c[3]}`;
    let a = agg.get(k);
    if (!a) agg.set(k, (a = { id: c[2], season, club: c[3], gp: 0, min: 0, g: 0, a: 0, yc: 0, rc: 0 }));
    a.gp++; a.min += Number(c[12]) || 0; a.g += Number(c[10]) || 0; a.a += Number(c[11]) || 0; a.yc += Number(c[8]) || 0; a.rc += Number(c[9]) || 0;
  }
}
for (const a of agg.values()) {
  const p = keep.get(a.id);
  (p.hist ??= []).push(a);
}

// ---------------------------------------------------------------- ratings
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
const TIER = { RPL: 65, FNL: 58, EPL: 74, ESP: 73, ITA: 72, GER: 72, FRA: 70 };
const teamMv = new Map();
for (const p of players) if (p.team && p.mv) (teamMv.get(p.team) ?? teamMv.set(p.team, []).get(p.team)).push(p.mv);

function targetOvr(p) {
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

function buildAttrs(p, ovr) {
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
const wageMul = { RPL: 0.9, FNL: 0.45, EPL: 1.35, ESP: 1.0, ITA: 0.95, GER: 1.0, FRA: 0.85 };
const wageFor = (ovr, lg) => Math.round((20_000 * Math.exp((ovr - 55) * 0.185) * (wageMul[lg] ?? 0.7)) / 5000) * 5000;

const out = [];
for (const p of players) {
  const a = ageOn(p.bd);
  const ovr = targetOvr(p);
  const r = buildAttrs(p, ovr);
  const hi = p.mv >= 2e7 ? 3 : p.mv >= 8e6 ? 2 : 0;
  const pot = clamp(Math.round(a <= 21 ? ovr + clamp((24 - a) * 1.7 + hi, 3, 14) + rnd(p.id, 'pot') * 3 : a <= 25 ? ovr + (26 - a) * 0.9 + rnd(p.id, 'pot') * 2 : ovr), ovr, 97);
  // Contract: the real end date when the player is still at the club the dataset knows; otherwise a model.
  const same = p.team && teamTm.get(p.team) === p.tmClub;
  let until = p.until && (same || !p.team) ? Number(p.until.slice(0, 4)) + (Number(p.until.slice(5, 7)) > 7 ? 1 : 0) : 0;
  const real = until >= 2027;
  if (!real) until = 2027 + Math.floor(rnd(p.id, 'until') * (a >= 32 ? 2 : a <= 23 ? 4 : 3)) + (same ? 0 : 1);
  until = Math.min(until, 2032);
  const lg = p.lg ?? (p.mv >= 2e7 ? 'ESP' : 'FRA');
  // Value used by the game: the real valuation, or the level implied by the rating when there is none.
  const val = p.mv > 0 ? p.mv : Math.round((1e5 * Math.pow(10, (ovr - 58 - (a > 28 ? Math.min(7, a - 28) : 0)) / 10)) / 25000) * 25000;
  const hist = (p.hist ?? []).sort((x, y) => x.season - y.season || y.min - x.min).map((h) => [h.season, tmToTeam.get(h.club) ?? (tmClubs.get(h.club)?.name ?? '—').replace(/^(FK|FC|PFK|AO FK|RFK) /, ''), h.gp, h.g, h.a, h.min]);
  const loanTeam = p.loanFrom ? teamByPage.get(p.loanFrom) : null;
  const medal = p.wc ? (p.ctry === 'ESP' ? 'gold' : p.ctry === 'ARG' ? 'silver' : p.ctry === 'ENG' ? 'bronze' : null) : null;
  out.push({
    id: p.id, fn: p.fn, ln: p.ln, ...(p.ru ? { ru: p.ru } : {}), role: p.role, ...(p.alt ? { alt: p.alt } : {}), foot: p.foot, bd: p.bd, ...(p.approx ? { ab: 1 } : {}),
    c: p.ctry, ...(p.ht ? { ht: p.ht } : {}), ...(p.num ? { n: p.num } : {}), ...(p.team ? { t: p.team } : p.ext ? { x: p.ext } : {}),
    o: ovr, p: pot, r, v: val, w: wageFor(ovr, lg), u: until, ...(real ? { cr: 1 } : {}),
    ...(p.caps ? { caps: p.caps } : {}), ...(p.ig ? { ig: p.ig } : {}), ...(hist.length ? { h: hist } : {}),
    ...(p.wc ? { wc: medal ?? 1 } : {}), ...(p.loanFrom ? { loan: loanTeam ? loanTeam.id : '' } : {}),
  });
}

// ---------------------------------------------------------------- teams
// Clubs with the same Russian name: the bigger one keeps it, the others get their city ("Динамо Махачкала").
{
  const value = (t) => out.filter((p) => p.t === t.id).reduce((x, p) => x + p.v, 0);
  const groups = new Map();
  for (const t of teams) (groups.get(t.ru) ?? groups.set(t.ru, []).get(t.ru)).push(t);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((x, y) => value(y) - value(x));
    for (const t of g.slice(1)) t.ru = t.ruCity ? `${t.ru} ${t.ruCity}` : t.name;
  }
}
const outTeams = teams.map((t) => {
  const sq = out.filter((p) => p.t === t.id);
  const tv = sq.reduce((s, p) => s + p.v, 0);
  const best = [...sq].sort((a, b) => b.o - a.o).slice(0, 14);
  const lvl = best.reduce((s, p) => s + p.o, 0) / Math.max(1, best.length);
  const rep = clamp(Math.round(18 + 22 * Math.log10(Math.max(tv, 2e6) / 1e6)), 25, 96);
  return {
    id: t.id, lg: t.lg, name: t.name, ru: t.ru, short: t.short, country: t.country, primary: t.primary, secondary: t.secondary, stadium: t.stadium, cap: t.cap,
    rep, coach: { name: t.coach ?? 'Главный тренер', rating: clamp(Math.round(lvl + 2 + (rnd(t.id, 'coach') - 0.5) * 8), 58, 92) },
    budget: Math.round((tv * 0.07 + 1e6) / 1e5) * 1e5, wages: sq.reduce((s, p) => s + p.w, 0),
  };
});

// ---------------------------------------------------------------- facts of the 2025-26 season
const winner = (page, key = 'winners') => {
  const txt = cached('en', page)?.text ?? '';
  const m = new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n]*)`).exec(txt);
  const l = m ? link(m[1]) : null;
  return l?.page ? teamByPage.get(l.page)?.id ?? cached('en', l.page)?.title ?? l.text : null;
};
const facts = { champions: {}, cup: winner('2025–26 Russian Cup'), cupFinalist: winner('2025–26 Russian Cup', 'second') };
for (const lg of LEAGUES) facts.champions[lg.id] = winner(lg.prev);
const byTitle = new Map(teams.map((t) => [t.page, t.id]));
for (const k in facts.champions) facts.champions[k] = byTitle.get(facts.champions[k]) ?? facts.champions[k];
facts.cup = byTitle.get(facts.cup) ?? facts.cup;
facts.cupFinalist = byTitle.get(facts.cupFinalist) ?? facts.cupFinalist;

const used = new Set(out.map((p) => p.c));
const nations = Object.fromEntries(COUNTRIES.filter((c) => used.has(c[0])).map((c) => [c[0], [c[3], flagEmoji(c[1])]]));

const world = {
  v: 1, snapshot: '2026-09', start: '2026-07-20',
  leagues: Object.fromEntries(LEAGUES.map((l) => [l.id, { ...LG_INFO[l.id], teams: outTeams.filter((t) => t.lg === l.id).map((t) => t.id) }])),
  teams: outTeams, players: out, nations,
  wc2026: { groups: wc.groups, squads: wc.squads, medals: ['ESP', 'ARG', 'ENG'], fourth: 'FRA', mvp: 'Rodri', keeper: 'Unai Simón', young: 'Pau Cubarsí' },
  facts,
};
fs.mkdirSync(path.join(ROOT, 'public', 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public', 'data', 'world.json'), JSON.stringify(world));

// ---------------------------------------------------------------- report
const size = fs.statSync(path.join(ROOT, 'public', 'data', 'world.json')).size;
console.log(`\nworld.json: ${(size / 1e6).toFixed(2)} MB, ${out.length} players, ${outTeams.length} clubs, ${Object.keys(nations).length} nations`);
console.log('Facts:', JSON.stringify(facts));
for (const lg of LEAGUES) {
  const ts = outTeams.filter((t) => t.lg === lg.id).map((t) => {
    const sq = out.filter((p) => p.t === t.id).sort((a, b) => b.o - a.o);
    return `${t.id}:${sq.length}/${(sq.slice(0, 11).reduce((s, p) => s + p.o, 0) / 11).toFixed(0)}`;
  });
  console.log(lg.id, ts.join(' '));
}
const top = [...out].sort((a, b) => b.o - a.o).slice(0, 25).map((p) => `${p.ln} ${p.o}`);
console.log('Top:', top.join(', '));
const rpl = out.filter((p) => outTeams.find((t) => t.id === p.t)?.lg === 'RPL').sort((a, b) => b.o - a.o).slice(0, 20).map((p) => `${p.ru ?? p.ln} ${p.o}/${p.p} (${p.t})`);
console.log('RPL top:', rpl.join(', '));
console.log(`Unknown birthdays (year only): ${stat.noDob}, of them without any year: ${stat.noYear}; without valuation: ${out.filter((p) => !players.find((x) => x.id === p.id)?.mv).length}`);
