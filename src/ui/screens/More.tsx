import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useGame, useL, applyTheme } from '../../store/game';
import { useNav } from '../../store/nav';
import { exportFile } from '../../persistence/db';
import { aiLineup } from '../../engine/ai';
import { wageBill } from '../../engine/contracts';
import { groupOrder, nationPower } from '../../engine/intl';
import { LEAGUES, foreignLimit, isForeign, transferWindows } from '../../engine/leagues';
import { squad } from '../../engine/lineup';
import { ownerGoalFor } from '../../engine/owner';
import type { IntlGame, League, Message, Tournament } from '../../engine/types';
import { Button, Card, cx, Divider, Empty, Meter, Pill, Row, SectionTitle, Segmented } from '../components/kit';
import { Screen, Sheet } from '../components/shell';
import { PlayerRow, TeamBadge } from '../components/media';
import { dateLong, dateShort, dispName, flag, money, nationName, seasonLabel } from '../format';

const TILES: { route: string; icon: string; title: string; sub: (L: League) => string; badge?: (L: League) => number }[] = [
  { route: 'news', icon: '📰', title: 'Новости', sub: (L) => `${L.news.length} материалов` },
  { route: 'inbox', icon: '✉️', title: 'Входящие', sub: (L) => { const n = L.inbox.filter((m) => !m.read).length; return n ? `${n} непрочитанных` : 'Всё прочитано'; }, badge: (L) => L.inbox.filter((m) => !m.read).length },
  { route: 'finance', icon: '💰', title: 'Финансы', sub: (L) => `Бюджет ${money(L.teams[L.user].budget)}` },
  { route: 'intl', icon: '🌍', title: 'Сборные', sub: (L) => L.intl.current?.name ?? 'ЧМ и Евро' },
  { route: 'career', icon: '👔', title: 'Карьера', sub: (L) => `Доверие ${L.owner.trust}/100` },
  { route: 'history', icon: '📜', title: 'История', sub: (L) => `${L.history.length} сез.` },
  { route: 'settings', icon: '⚙️', title: 'Настройки', sub: () => 'Сохранения, звук, режимы' },
];

export function MoreScreen() {
  const L = useL();
  const push = useNav((s) => s.push);
  const quit = useGame((s) => s.quit);
  return (
    <Screen title="Ещё" large subtitle={`${L.gm.name} · ${L.teams[L.user].ru}`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3">
        {TILES.map((t, i) => {
          const badge = t.badge?.(L) ?? 0;
          return (
            <motion.button
              key={t.route}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.025 }}
              onClick={() => push(t.route)}
              className="press glass relative rounded-3xl p-4 text-left min-h-[104px] flex flex-col"
            >
              <div className="text-[28px] leading-none">{t.icon}</div>
              {badge > 0 && <span className="absolute right-3 top-3 min-w-[20px] h-5 px-1.5 rounded-full bg-bad text-white text-[11px] font-semibold flex items-center justify-center">{badge}</span>}
              <div className="font-display uppercase tracking-wide text-[16px] mt-auto pt-3">{t.title}</div>
              <div className="text-[12px] text-muted truncate">{t.sub(L)}</div>
            </motion.button>
          );
        })}
      </div>
      <Button full className="mt-4 lg:w-auto lg:px-8" onClick={quit}>Выйти в главное меню</Button>
      <p className="text-[11.5px] text-faint mt-5 leading-snug">
        Фан-проект, не связан с РПЛ, РФС, FIFA, UEFA и клубами; некоммерческий. Составы клубов — сентябрь 2026 (Википедия, CC BY-SA). Биографии, оценки стоимости и статистика — открытый набор transfermarkt-datasets (CC0). Фотографии игроков загружаются с Transfermarkt. Зарплаты — модель. Все игроки на старте реальные; вымышлены только воспитанники академий следующих сезонов.
      </p>
    </Screen>
  );
}

export function InboxScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const act = useGame((s) => s.act);
  const nav = useNav();
  const [open, setOpen] = useState<Message | null>(() => L.inbox.find((m) => m.id === params.open) ?? null);
  useEffect(() => { if (open && !open.read) act(() => { open.read = true; }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const follow = (m: Message) => {
    setOpen(null);
    if (!m.ref) return;
    if (m.ref.type === 'player') nav.push('player', { id: m.ref.id });
    else if (m.ref.type === 'offer') nav.go('market', undefined, { tab: 'offers' });
    else if (m.ref.type === 'screen') { if (m.ref.id === 'roster') nav.go('roster', undefined, { tab: 'lineup' }); else nav.go('more', String(m.ref.id)); }
  };
  return (
    <Screen title="Входящие" right={<button className="text-[13px] accent-text px-3 h-11" onClick={() => act(() => L.inbox.forEach((m) => (m.read = true)))}>Прочитать все</button>}>
      {L.inbox.length ? (
        <Card pad={false} className="mt-1 overflow-hidden">
          {L.inbox.map((m) => (
            <div key={m.id} onClick={() => setOpen(m)} className="press px-4 py-3 border-b border-white/5 last:border-0 flex gap-3">
              <span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', m.read ? 'bg-transparent' : 'bg-[var(--accent)]')} />
              <div className="min-w-0">
                <div className="text-[12px] text-muted">{m.from} · {dateShort(m.date)}</div>
                <div className={cx('text-[15px] truncate', !m.read && 'font-semibold')}>{m.title}</div>
                <div className="text-[13px] text-muted truncate">{m.body.split('\n')[0]}</div>
              </div>
            </div>
          ))}
        </Card>
      ) : <Empty icon="📭" title="Писем нет" />}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title}>
        {open && (
          <>
            <div className="text-[12.5px] text-muted mb-3">{open.from} · {dateLong(open.date)}</div>
            <div className="text-[15px] whitespace-pre-line leading-relaxed">{open.body}</div>
            {open.ref && <Button variant="primary" full className="mt-5" onClick={() => follow(open)}>Перейти</Button>}
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const NEWS_ICON: Record<string, string> = { transfer: '🔁', sign: '✍️', injury: '✚', game: '⚽', award: '🏆', youth: '🌱', rumor: '👂', owner: '👔', milestone: '🎯', league: '📣', social: '💬', suspension: '🟥', retire: '👋', achievement: '🏅', intl: '🌍' };
export function NewsScreen() {
  const L = useL();
  const push = useNav((s) => s.push);
  const [f, setF] = useState<'all' | 'main' | 'transfer'>('all');
  const list = L.news.filter((n) => (f === 'main' ? n.important : f === 'transfer' ? n.kind === 'transfer' || n.kind === 'sign' : !L.settings.hideMedia || n.kind !== 'social')).slice(0, 150);
  return (
    <Screen title="Новости" headerExtra={<div className="px-4 pb-2"><Segmented value={f} onChange={setF} options={[{ v: 'all', label: 'Все' }, { v: 'main', label: 'Главное' }, { v: 'transfer', label: 'Трансферы' }]} /></div>}>
      <div className="flex flex-col gap-2 mt-1">
        {list.map((n) => (
          <div key={n.id} onClick={() => (n.players?.[0] ? push('player', { id: n.players[0] }) : n.team ? push('team', { id: n.team }) : undefined)} className={cx('glass rounded-2xl px-3.5 py-2.5 flex gap-3', (n.players?.length || n.team) && 'press', n.important && 'border-gold/30')}>
            <span className="text-[20px]">{NEWS_ICON[n.kind] ?? '•'}</span>
            <div className="min-w-0 flex-1">
              {n.author && <div className="text-[12px] text-muted">{n.author} <span className="text-faint">{n.handle}</span></div>}
              <div className="text-[14.5px] leading-snug">{n.title}</div>
              <div className="text-[11.5px] text-faint mt-0.5">{dateShort(n.date)}{n.likes ? ` · ♥ ${n.likes}` : ''}</div>
            </div>
          </div>
        ))}
        {!list.length && <Empty icon="📰" title="Новостей пока нет" />}
      </div>
    </Screen>
  );
}

export function FinanceScreen() {
  const L = useL();
  const t = L.teams[L.user];
  const sq = squad(L, t.id).filter((p) => p.c).sort((a, b) => (b.c!.wage ?? 0) - (a.c!.wage ?? 0));
  const bill = wageBill(L, t.id);
  const lim = foreignLimit(t.lg, L.season);
  const exp = sq.filter((p) => p.c!.until <= L.season + 1 && !p.loan);
  const [w1, w2] = transferWindows(L.season);
  return (
    <Screen title="Финансы">
      <div className="grid grid-cols-2 gap-2 mt-1">
        <Card className="!p-3"><div className="text-[11px] uppercase tracking-wider text-muted">На трансферы</div><div className="num text-[24px]">{money(t.budget)}</div><div className="text-[11.5px] text-muted">потрачено {money(L.seasonLog.spent)} · получено {money(L.seasonLog.earned)}</div></Card>
        <Card className="!p-3"><div className="text-[11px] uppercase tracking-wider text-muted">Зарплаты в год</div><div className="num text-[24px]">{money(bill)}</div><Meter value={bill} max={t.wageBudget} className="mt-1.5" color={bill > t.wageBudget ? '#ff5a5f' : undefined} /><div className="text-[11.5px] text-muted mt-1">лимит {money(t.wageBudget)}</div></Card>
      </div>
      <Card className="mt-2 text-[13.5px] leading-relaxed">
        <div>Летнее окно: {dateShort(w1[0])} — {dateShort(w1[1])}. Зимнее: {dateShort(w2[0])} — {dateShort(w2[1])}.</div>
        {lim && <div>Легионеры: {sq.filter((p) => isForeign(p, t.country)).length} из {lim[0]} в заявке, на поле не больше {lim[1]}. Граждане России, Беларуси, Казахстана, Армении и Киргизии легионерами не считаются.</div>}
        <div className="text-muted mt-1">Бюджет на следующий сезон зависит от места в таблице и репутации клуба. Деньги от продаж остаются в клубе.</div>
      </Card>
      {exp.length > 0 && (
        <>
          <SectionTitle>Контракт истекает летом {L.season + 1}</SectionTitle>
          <Card pad={false} className="overflow-hidden">{exp.map((p) => <PlayerRow key={p.id} dense p={p} right={<span className="text-[12px] text-warn mr-1">продлить?</span>} />)}</Card>
        </>
      )}
      <SectionTitle>Зарплатная ведомость</SectionTitle>
      <Card pad={false} className="overflow-hidden">{sq.map((p) => <PlayerRow key={p.id} dense p={p} right={<span className="num text-[13px] mr-1 text-right leading-tight">{money(p.c!.wage)}<br /><span className="text-[10.5px] text-muted">до {p.c!.until}</span></span>} />)}</Card>
    </Screen>
  );
}

export function HistoryScreen() {
  const L = useL();
  const t = L.teams[L.user];
  return (
    <Screen title="История">
      <SectionTitle className="!mt-2">Трофеи клуба (за время карьеры)</SectionTitle>
      {t.trophies.length ? <div className="flex gap-1.5 flex-wrap">{t.trophies.map((x, i) => <Pill key={i} color="#e8c26a">🏆 {x}</Pill>)}</div> : <div className="text-muted text-[14px]">Пока пусто. Всё впереди.</div>}
      <SectionTitle>Сезоны</SectionTitle>
      {L.history.length ? L.history.map((h) => (
        <Card key={h.season} className="mb-2.5">
          <div className="flex items-center gap-3">
            <TeamBadge id={h.champion} size={40} />
            <div className="flex-1 min-w-0">
              <div className="font-display uppercase text-[17px]">{seasonLabel(h.season)} · {LEAGUES[h.lg].short}</div>
              <div className="text-[13px] text-muted truncate">Чемпион — {L.teams[h.champion]?.ru}{h.cup ? ` · Кубок — ${L.teams[h.cup]?.ru}` : ''}</div>
            </div>
            <div className="text-right"><div className="num text-[22px] leading-none">{h.userRecord.place}</div><div className="text-[10px] text-muted uppercase">место</div></div>
          </div>
          <div className="text-[13px] mt-2 text-ink/85">Вы: {h.userRecord.w}–{h.userRecord.d}–{h.userRecord.l}, {h.userRecord.pts} очк.{h.topScorer ? ` · Бомбардир: ${h.topScorer.name} (${h.topScorer.g})` : ''}</div>
          {(h.promoted.length > 0 || h.relegated.length > 0) && <div className="text-[12.5px] text-muted mt-1">↑ {h.promoted.map((id) => L.teams[id]?.ru).join(', ')} · ↓ {h.relegated.map((id) => L.teams[id]?.ru).join(', ')}</div>}
        </Card>
      )) : <div className="text-muted text-[14px]">Первый сезон ещё не завершён.</div>}
      <SectionTitle>Чемпионы мира</SectionTitle>
      <Card className="flex flex-col gap-1.5 text-[14px]">
        {L.intl.history.map((h) => <div key={h.id}>{h.name}: 🥇 {flag(h.medals[0])} {nationName(h.medals[0])} · 🥈 {nationName(h.medals[1])} · 🥉 {nationName(h.medals[2])}{h.real ? ' (реальный итог)' : ''}</div>)}
      </Card>
    </Screen>
  );
}

export function CareerScreen() {
  const L = useL();
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const nav = useNav();
  const take = (id: string) => {
    act(() => {
      const old = L.teams[L.user];
      aiLineup(L, old);
      old.lineup.auto = true;
      L.user = id;
      L.gm.fired = false; L.gm.offers = undefined; L.gm.hiredSeason = L.season;
      L.owner.trust = 55; L.owner.warnings = 0;
      const g = ownerGoalFor(L, id);
      L.owner.goal = g.goal; L.owner.goalText = g.text;
      L.teams[id].lineup.auto = false;
      L.offers = []; L.negotiations = {};
    });
    applyTheme(L);
    toast(`Вы возглавили «${L.teams[id].ru}»`, 'good');
    nav.go('office');
  };
  return (
    <Screen title="Карьера">
      <Card className="mt-1">
        <div className="font-display uppercase text-[20px]">{L.gm.name}</div>
        <div className="text-[13.5px] text-muted">Сезонов: {L.gm.seasons} · чемпионств: {L.gm.titles} · в клубе с {seasonLabel(L.gm.hiredSeason)}</div>
        <div className="flex justify-between text-[13px] mt-3 mb-1"><span className="text-muted">Репутация</span><span className="num">{L.gm.rep}/100</span></div>
        <Meter value={L.gm.rep} />
      </Card>
      {L.gm.fired && (
        <>
          <Card className="mt-3 border-bad/40">
            <div className="font-semibold text-[16px]">Вас уволили</div>
            <div className="text-[14px] text-muted mt-1">Совет директоров «{L.teams[L.user].ru}» расторг контракт. {L.gm.offers?.length ? 'Но без работы вы не останетесь — есть предложения:' : 'Предложений от других клубов нет.'}</div>
          </Card>
          {(L.gm.offers ?? []).map((id) => (
            <Card key={id} className="mt-2 flex items-center gap-3" onClick={() => take(id)}>
              <TeamBadge id={id} size={42} />
              <div className="flex-1"><div className="font-medium">{L.teams[id].ru}</div><div className="text-[12.5px] text-muted">{LEAGUES[L.teams[id].lg].short} · бюджет {money(L.teams[id].budget)}</div></div>
              <Pill color="#3ddc97">принять</Pill>
            </Card>
          ))}
        </>
      )}
      <SectionTitle>Послужной список</SectionTitle>
      {L.gm.history.length ? <Card className="flex flex-col gap-1.5 text-[14px]">{[...L.gm.history].reverse().map((h, i) => <div key={i} className="flex justify-between gap-3"><span className="text-muted">{seasonLabel(h.season)} · {L.teams[h.team]?.ru}</span><span className="text-right">{h.result}</span></div>)}</Card> : <div className="text-muted text-[14px]">Итоги появятся после первого сезона.</div>}
    </Screen>
  );
}

export function SettingsScreen() {
  const L = useL();
  const act = useGame((s) => s.act);
  const save = useGame((s) => s.save);
  const toast = useGame((s) => s.toast);
  const s = L.settings;
  const T = ({ k, label, sub }: { k: 'sound' | 'stopOnUserGames' | 'watchGames' | 'hideMedia' | 'noFiring' | 'intlRussia'; label: string; sub?: string }) => (
    <Row onClick={() => act(() => { s[k] = !s[k]; })}>
      <div className="flex-1"><div className="text-[15.5px]">{label}</div>{sub && <div className="text-[12.5px] text-muted">{sub}</div>}</div>
      <div className={cx('w-[48px] h-[30px] rounded-full relative transition-colors shrink-0', s[k] ? 'accent-bg' : 'bg-white/15')}><span className={cx('absolute top-[3px] w-6 h-6 rounded-full bg-white transition-all', s[k] ? 'left-[21px]' : 'left-[3px]')} /></div>
    </Row>
  );
  return (
    <Screen title="Настройки">
      <SectionTitle className="!mt-2">Игра</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        <T k="watchGames" label="Показывать матч после игры" sub="Матч-центр с живым повтором открывается сам" /><Divider />
        <T k="stopOnUserGames" label="Останавливаться после каждого матча" /><Divider />
        <T k="sound" label="Звук гола" /><Divider />
        <T k="hideMedia" label="Скрыть соцсети в новостях" /><Divider />
        <T k="noFiring" label="Без увольнения" sub="Доверие руководства считается, но уволить вас нельзя" /><Divider />
        <T k="intlRussia" label="Россия на ЧМ и Евро" sub="В реальности сборная отстранена с 2022 года" />
      </Card>
      <SectionTitle>Сложность</SectionTitle>
      <Segmented value={s.difficulty} onChange={(v) => act(() => { s.difficulty = v; })} options={[{ v: 'rookie', label: 'Новичок' }, { v: 'real', label: 'Реализм' }, { v: 'hard', label: 'Хардкор' }]} />
      <div className="text-[12px] text-muted mt-1.5 px-1">Меняет цены и аппетиты на рынке и терпение руководства. Матчевый движок от сложности не зависит.</div>
      <SectionTitle>Сохранение</SectionTitle>
      <div className="flex gap-2">
        <Button full onClick={async () => { await save(); toast('Сохранено', 'good'); }}>Сохранить</Button>
        <Button full onClick={() => exportFile(L)}>Экспорт в файл</Button>
      </div>
      <div className="text-[12px] text-muted mt-2 px-1">Игра сохраняется автоматически в памяти устройства. Экспорт в файл — страховка на случай очистки данных браузера.</div>
    </Screen>
  );
}

const STAGE: Record<string, string> = { r32: '1/16 финала', r16: '1/8 финала', qf: 'Четвертьфиналы', sf: 'Полуфиналы', bronze: 'Матч за 3-е место', final: 'Финал' };
function IntlRow({ g }: { g: IntlGame }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 min-h-[42px] border-b border-white/5 last:border-0 text-[14px]">
      <span className="text-right truncate">{nationName(g.h)} {flag(g.h)}</span>
      {g.played ? <span className="num text-[16px] w-[60px] text-center">{g.hs}:{g.as}{g.pen ? <span className="block text-[10px] text-muted -mt-1">пен. {g.pen[0]}:{g.pen[1]}</span> : null}</span> : <span className="text-[11.5px] text-muted w-[60px] text-center">{dateShort(g.day)}</span>}
      <span className="truncate">{flag(g.a)} {nationName(g.a)}</span>
    </div>
  );
}
function TournamentView({ L, T }: { L: League; T: Tournament }) {
  const push = useNav((s) => s.push);
  const ko = Object.keys(STAGE).filter((s) => T.games.some((g) => g.stage === s)).reverse();
  const mine = Object.entries(T.rosters).flatMap(([c, ids]) => ids.filter((id) => L.players[id]?.team === L.user).map((id) => ({ c, p: L.players[id] })));
  return (
    <>
      <Card className="mt-1">
        <div className="font-display uppercase text-[20px]">{T.name}</div>
        <div className="text-[13px] text-muted">{T.host} · {dateShort(T.start)} — {dateShort(T.end)} · {T.teams.length} сборных</div>
        {T.medals && <div className="mt-2 text-[15px]">🥇 {flag(T.medals[0])} {nationName(T.medals[0])} · 🥈 {nationName(T.medals[1])} · 🥉 {nationName(T.medals[2])}</div>}
        {T.mvp && L.players[T.mvp] && <div className="text-[13.5px] mt-1">Лучший игрок: <button className="accent-text" onClick={() => push('player', { id: T.mvp })}>{dispName(L.players[T.mvp])}</button></div>}
      </Card>
      {mine.length > 0 && (<><SectionTitle>Наши игроки на турнире</SectionTitle><Card pad={false} className="overflow-hidden">{mine.map(({ c, p }) => <PlayerRow key={p.id} dense p={p} sub={<>{flag(c)} {nationName(c)}</>} />)}</Card></>)}
      {ko.map((s) => (<div key={s}><SectionTitle>{STAGE[s]}</SectionTitle><Card pad={false} className="overflow-hidden">{T.games.filter((g) => g.stage === s).map((g) => <IntlRow key={g.id} g={g} />)}</Card></div>))}
      {Object.keys(T.groups).map((l) => (
        <div key={l}>
          <SectionTitle>Группа {l}</SectionTitle>
          <Card pad={false} className="overflow-hidden">
            {groupOrder(T, l).map((c, i) => { const r = T.table[c]; return (
              <div key={c} className="grid grid-cols-[20px_1fr_24px_44px_30px] items-center gap-2 px-3 min-h-[40px] border-b border-white/5 text-[14px] tnum">
                <span className="num text-muted">{i + 1}</span><span className="truncate">{flag(c)} {nationName(c)}</span><span className="text-muted text-center">{r.gp}</span><span className="text-muted text-center text-[12.5px]">{r.gf}:{r.ga}</span><span className="num text-right text-[16px]">{r.pts}</span>
              </div>); })}
            {T.games.filter((g) => g.stage === l).map((g) => <IntlRow key={g.id} g={g} />)}
          </Card>
        </div>
      ))}
    </>
  );
}

export function IntlScreen() {
  const L = useL();
  const T = L.intl.current ?? L.intl.prev;
  const [tab, setTab] = useState<'t' | 'rank'>(T ? 't' : 'rank');
  const year = Number(L.date.slice(0, 4));
  const nextYear = [2028, 2030, 2032, 2034, 2036, 2038].find((y) => y > year || (y === year && L.date < `${y}-06-01`)) ?? year + 2;
  return (
    <Screen title="Сборные" headerExtra={<div className="px-4 pb-2"><Segmented value={tab} onChange={setTab} options={[{ v: 't', label: 'Турнир' }, { v: 'rank', label: 'Рейтинг сборных' }]} /></div>}>
      {tab === 't' && (T ? <TournamentView L={L} T={T} /> : (
        <>
          <Card className="mt-1">
            <div className="font-display uppercase text-[18px]">Чемпионат мира 2026 — реальный итог</div>
            <div className="mt-2 text-[15px]">🥇 {flag('ESP')} Испания · 🥈 {flag('ARG')} Аргентина · 🥉 {flag('ENG')} Англия</div>
            <div className="text-[13px] text-muted mt-2">Игроки-призёры отмечены медалями в профилях. Следующий турнир в игре — {nextYear % 4 === 2 ? 'чемпионат мира' : 'чемпионат Европы'} {nextYear} (июнь). Составы сборных собираются из реальных игроков всех лиг.</div>
          </Card>
          <Empty icon="🌍" title="Турнир ещё не начался" text="Заявки объявят в конце мая турнирного года." />
        </>
      ))}
      {tab === 'rank' && (
        <Card pad={false} className="mt-1 overflow-hidden">
          {L.intl.ranking.slice(0, 60).map((c, i) => (
            <div key={c} className="flex items-center gap-3 px-3 min-h-[42px] border-b border-white/5 last:border-0 text-[14.5px]">
              <span className="num text-muted w-6">{i + 1}</span><span className="text-[19px]">{flag(c)}</span><span className="flex-1 truncate">{nationName(c)}</span><span className="num">{nationPower(L, c).toFixed(1)}</span>
            </div>
          ))}
        </Card>
      )}
    </Screen>
  );
}

export function CelebrationModal({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const close = useNav((s) => s.closeModal);
  const t = L.teams[L.user];
  const cup = params.what === 'cup';
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6" style={{ background: `radial-gradient(90% 60% at 50% 30%, color-mix(in oklab, ${t.primary} 70%, #05070d), #05070d)` }}>
      {Array.from({ length: 26 }, (_, i) => (
        <motion.span key={i} className="absolute text-[20px]" style={{ left: `${(i * 37) % 100}%`, top: -30 }} animate={{ y: ['0vh', '110vh'], rotate: [0, 360] }} transition={{ duration: 3 + (i % 5), repeat: Infinity, delay: (i % 7) * 0.4, ease: 'linear' }}>{['🎉', '✨', '🎊', '⭐'][i % 4]}</motion.span>
      ))}
      <motion.div initial={{ scale: 0.3, opacity: 0, rotate: -15 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 10 }} className="text-[120px] leading-none">🏆</motion.div>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}>
        <div className="font-display uppercase text-[40px] leading-none text-gradient-gold mt-6">{cup ? 'Кубок России наш!' : 'Чемпионы!'}</div>
        <div className="text-[17px] mt-3">«{t.ru}» — {cup ? 'обладатель Кубка России' : `чемпион: ${LEAGUES[t.lg].name}`}</div>
        <div className="text-muted mt-1">Сезон {seasonLabel(L.season)}</div>
      </motion.div>
      <Button variant="gold" size="lg" className="mt-10 relative" onClick={close}>Продолжить</Button>
    </div>
  );
}
