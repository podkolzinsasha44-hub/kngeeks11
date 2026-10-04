// Champions League inside the League tab: league-phase table, matches by matchday and round,
// the knock-out bracket, scorers and the roll of honour.
import { useMemo } from 'react';
import { useNav } from '../../store/nav';
import { statKey } from '../../engine/leagues';
import { leaders } from '../../engine/stats';
import type { CupTie, Game, League } from '../../engine/types';
import { club, PRIZE, ROUNDS, UCL, uclOrder } from '../../engine/ucl';
import { Card, Chips, cx, Empty, SectionTitle } from '../components/kit';
import { PlayerRow, TeamBadge } from '../components/media';
import { clubLabel, dateShort, money, ROLE_RU, seasonLabel } from '../format';
import { keepFor, useKeep } from '../keep';
import { GameRow } from './League';

export type UclTab = 'table' | 'games' | 'bracket' | 'players';
type Tab = UclTab;
export const UCL_TABS: { v: UclTab; label: string }[] = [{ v: 'table', label: 'Таблица' }, { v: 'games', label: 'Матчи' }, { v: 'bracket', label: 'Сетка' }, { v: 'players', label: 'Игроки' }];
export const uclDefaultTab = (L: League): UclTab => (L.ucl?.phase === 'ko' || L.ucl?.phase === 'done' ? 'bracket' : 'table');

/** Opens the League tab on the Champions League. */
export function openUcl(tab: Tab = 'table') {
  const nav = useNav.getState();
  const root = nav.stacks.league[0].key;
  keepFor(root, 'league.lg', UCL);
  keepFor(root, 'ucl.tab', tab);
  nav.go('league');
}

export function UclView({ L, tab }: { L: League; tab: Tab }) {
  const u = L.ucl;
  if (!u) {
    return <Empty icon="⭐" title="Лига чемпионов" text={L.ext ? 'Турнир начнётся в следующем сезоне: участников определят итоговые таблицы АПЛ, Ла Лиги, Серии A, Бундеслиги и Лиги 1.' : 'Обновите игру, чтобы в мире появилась Лига чемпионов.'} />;
  }
  return (
    <>
      {tab === 'table' && <Table L={L} />}
      {tab === 'games' && <Games L={L} />}
      {tab === 'bracket' && <Bracket L={L} />}
      {tab === 'players' && <Scorers L={L} />}
    </>
  );
}

const ZONE = (i: number) => (i < 8 ? '#3ddc97' : i < 24 ? '#7fd3ff' : '#ff5a5f');

function Table({ L }: { L: League }) {
  const push = useNav((s) => s.push);
  const u = L.ucl!;
  const order = useMemo(() => uclOrder(L), [L.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = order.indexOf(L.user);
  return (
    <>
      {mine >= 0 && <MyPath L={L} place={mine + 1} />}
      <Card pad={false} className={cx(mine >= 0 ? 'mt-3' : 'mt-1', 'overflow-hidden')}>
        <div className="grid grid-cols-[26px_1fr_24px_24px_24px_24px_40px_32px] gap-x-1 items-center px-3 py-2 text-[10.5px] uppercase tracking-wider text-muted border-b border-white/5">
          <span>#</span><span>Клуб</span><span className="text-center">И</span><span className="text-center">В</span><span className="text-center">Н</span><span className="text-center">П</span><span className="text-center">Мячи</span><span className="text-right">О</span>
        </div>
        {order.map((id, i) => {
          const t = club(L, id), r = u.table[id];
          return (
            <div key={id} onClick={() => push('team', { id })} className={cx('press grid grid-cols-[26px_1fr_24px_24px_24px_24px_40px_32px] gap-x-1 items-center px-3 min-h-[46px] border-b border-white/5 last:border-0 tnum text-[14px]', id === L.user && 'bg-white/[0.07]', (i === 7 || i === 23) && 'border-b-white/20')}>
              <span className="num text-[14px] pl-1.5 border-l-[3px]" style={{ borderColor: ZONE(i) }}>{i + 1}</span>
              <span className="flex items-center gap-2 min-w-0"><TeamBadge team={t} size={24} /><span className={cx('truncate', id === L.user && 'font-semibold')}>{t.ru}</span></span>
              <span className="text-center text-muted">{r.gp}</span><span className="text-center">{r.w}</span><span className="text-center">{r.d}</span><span className="text-center">{r.l}</span>
              <span className="text-center text-muted text-[12.5px]">{r.gf}:{r.ga}</span>
              <span className="text-right num text-[16px]">{r.pts}</span>
            </div>
          );
        })}
      </Card>
      <div className="flex gap-3 flex-wrap text-[11.5px] text-muted mt-2.5 px-1">
        <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#3ddc97' }} />1/8 финала</span>
        <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#7fd3ff' }} />стыковые матчи</span>
        <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#ff5a5f' }} />выбывание</span>
      </div>
      <div className="text-[11.5px] text-faint mt-1.5 px-1">
        Восемь матчей с соперниками из всех четырёх корзин. При равенстве очков — разница мячей, забитые, забитые в гостях, победы. Призовые: {money(PRIZE.start)} за участие, {money(PRIZE.win)} за победу, {money(PRIZE.draw)} за ничью.
      </div>
    </>
  );
}

/** The user's club in the tournament: place, next match, what is at stake. */
function MyPath({ L, place }: { L: League; place: number }) {
  const u = L.ucl!;
  const next = L.games.filter((g) => g.comp === UCL && !g.played && (g.h === L.user || g.a === L.user)).sort((a, b) => (a.day < b.day ? -1 : 1))[0];
  const out = u.phase !== 'league' && !next && u.champion !== L.user;
  const opp = next ? club(L, next.h === L.user ? next.a : next.h) : null;
  return (
    <Card className="mt-1 flex items-center gap-3">
      <div className="w-12 h-12 rounded-2xl grid place-items-center text-[22px] bg-white/8">{u.champion === L.user ? '🏆' : '⭐'}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{u.champion === L.user ? 'Победитель Лиги чемпионов' : u.phase === 'league' ? (u.table[L.user].gp ? `${place}-е место в общем этапе` : 'Общий этап: 8 матчей') : out ? 'Турнир окончен' : 'Мы в плей-офф'}</div>
        <div className="text-[13px] text-muted truncate">{next && opp ? `${next.h === L.user ? 'Дома' : 'В гостях'} с «${opp.ru}» · ${dateShort(next.day)}${typeof next.rd === 'number' ? ` · ${next.rd}-й тур` : ` · ${next.rd}`}` : u.phase === 'league' ? 'Матчи общего этапа сыграны' : ''}</div>
      </div>
      {opp && <TeamBadge team={opp} size={36} />}
    </Card>
  );
}

function Games({ L }: { L: League }) {
  const cup = L.cups[UCL];
  const games = useMemo(() => L.games.filter((g) => g.comp === UCL), [L.games.length, L.date]); // eslint-disable-line react-hooks/exhaustive-deps
  // Stages: the eight matchdays, then the knock-out rounds that have been drawn.
  const stages = useMemo(() => [...Array(8).keys()].map((i) => `${i + 1}`).concat(ROUNDS.filter((r) => games.some((g) => g.rd === r))), [games]);
  const next = games.filter((g) => !g.played).sort((a, b) => (a.day < b.day ? -1 : 1))[0];
  const [stage, setStage] = useKeep('ucl.stage', String(next?.rd ?? stages[stages.length - 1]));
  const i = Math.max(0, stages.indexOf(stage));
  const cur = stages[i];
  const list = games.filter((g) => String(g.rd) === cur).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id - b.id));
  const days = [...new Set(list.map((g) => g.day))];
  return (
    <>
      <div className="flex items-center justify-between mt-1 mb-1">
        <button aria-label="Назад" className="press w-11 h-11 glass rounded-xl disabled:opacity-30" disabled={i === 0} onClick={() => setStage(stages[i - 1])}>‹</button>
        <div className="text-center">
          <div className="font-display uppercase tracking-wide text-[17px]">{/^\d+$/.test(cur) ? `${cur}-й тур` : cur}</div>
          <div className="text-[11.5px] text-muted">{/^\d+$/.test(cur) ? 'общий этап' : cup?.rounds.find((r) => r.name === cur) ? 'плей-офф' : ''}</div>
        </div>
        <button aria-label="Вперёд" className="press w-11 h-11 glass rounded-xl disabled:opacity-30" disabled={i === stages.length - 1} onClick={() => setStage(stages[i + 1])}>›</button>
      </div>
      {list.length ? days.map((d) => (
        <div key={d}>
          <SectionTitle className="!mt-3">{dateShort(d)}</SectionTitle>
          <Card pad={false} className="overflow-hidden">{list.filter((g) => g.day === d).map((g) => <GameRow key={g.id} L={L} g={g} />)}</Card>
        </div>
      )) : <Empty icon="📅" title="Пары ещё не определены" text="Соперники по плей-офф определяются после завершения предыдущей стадии." />}
    </>
  );
}

function Bracket({ L }: { L: League }) {
  const u = L.ucl!, cup = L.cups[UCL];
  const games = new Map(L.games.map((g) => [g.id, g]));
  const rounds = [...ROUNDS.keys()].reverse().filter((r) => cup?.ties.some((t) => t.round === r));
  return (
    <>
      {u.champion && (
        <Card className="mt-1 text-center">
          <div className="text-3xl">🏆</div>
          <div className="flex items-center justify-center gap-2 mt-1"><TeamBadge team={club(L, u.champion)} size={28} /><span className="font-display uppercase text-[18px]">{club(L, u.champion).ru}</span></div>
          <div className="text-muted text-[13px]">победитель Лиги чемпионов {seasonLabel(u.season)}</div>
        </Card>
      )}
      {!rounds.length && (
        <Card className="mt-1">
          <div className="font-medium">Плей-офф после общего этапа</div>
          <div className="text-[13px] text-muted mt-1 leading-snug">Команды с 1-го по 8-е место выходят в 1/8 финала. 9–24-е играют стыковые матчи: 9–10-е с 23–24-ми, 11–12-е с 21–22-ми и так далее, победители встречаются с первой восьмёркой. Сетка фиксирована: 1-е и 2-е места могут встретиться только в финале, ответный матч дома у команды, которая выше в общем этапе.</div>
        </Card>
      )}
      {rounds.map((r) => (
        <div key={r}>
          <SectionTitle right={<span className="text-[12px] text-muted">{r === 4 ? `${dateShort(cup.rounds[4].day)} · ${u.final}` : dateShort(cup.rounds[r].day)}</span>}>{ROUNDS[r]}</SectionTitle>
          <Card pad={false} className="overflow-hidden">{cup.ties.filter((t) => t.round === r).map((t) => <TieRow key={t.id} L={L} tie={t} games={games} />)}</Card>
        </div>
      ))}
      {u.history.length > 0 && (
        <>
          <SectionTitle>Победители</SectionTitle>
          <Card pad={false} className="overflow-hidden">
            {u.history.map((h) => (
              <div key={h.season} className="flex items-center gap-3 px-3 min-h-[48px] border-b border-white/5 last:border-0 text-[14px]">
                <span className="num text-muted w-[52px]">{seasonLabel(h.season)}</span>
                <TeamBadge team={club(L, h.champion)} size={24} />
                <span className="flex-1 min-w-0 truncate">{club(L, h.champion)?.ru}<span className="text-muted"> · финал с «{club(L, h.finalist)?.ru}»</span></span>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

/** A two-legged tie: both clubs, the aggregate (or the final score) and the winner in bold. */
function TieRow({ L, tie, games }: { L: League; tie: CupTie; games: Map<number, Game> }) {
  const openModal = useNav((s) => s.openModal);
  const legs = tie.games.map((id) => games.get(id)).filter(Boolean) as Game[];
  const played = legs.filter((g) => g.played);
  // Goals of tie.h and tie.a over the legs played.
  const gh = played.reduce((s, g) => s + (g.h === tie.h ? g.hs! : g.as!), 0), ga = played.reduce((s, g) => s + (g.h === tie.a ? g.hs! : g.as!), 0);
  const last = legs[legs.length - 1];
  const H = club(L, tie.h), A = club(L, tie.a);
  const mine = tie.h === L.user || tie.a === L.user;
  const open = () => { const g = [...played].pop(); if (g) openModal('match', { id: g.id }); };
  return (
    <div onClick={open} className={cx('grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 min-h-[56px] border-b border-white/5 last:border-0 text-[13.5px]', played.length && 'press', mine && 'bg-white/[0.06]')}>
      <span className={cx('flex items-center justify-end gap-2 min-w-0', tie.winner && tie.winner !== tie.h && 'opacity-50', tie.winner === tie.h && 'font-semibold')}><span className="truncate text-right">{H.ru}</span><TeamBadge team={H} size={22} /></span>
      <span className="w-[76px] text-center leading-tight">
        {played.length ? <span className="num text-[16px]">{gh}:{ga}</span> : <span className="text-[11.5px] text-muted">{dateShort(legs[0]?.day ?? '')}</span>}
        <span className="block text-[10px] text-muted">
          {legs.length === 2 ? (played.length === 2 ? (last.pen ? `пен. ${last.h === tie.h ? last.pen[0] : last.pen[1]}:${last.h === tie.h ? last.pen[1] : last.pen[0]}` : 'по сумме') : played.length ? `1-й матч · ответный ${dateShort(legs[1].day)}` : `ответный ${dateShort(legs[1].day)}`) : last.pen ? `пен. ${last.pen[0]}:${last.pen[1]}` : last.et ? 'д.в.' : 'один матч'}
        </span>
      </span>
      <span className={cx('flex items-center gap-2 min-w-0', tie.winner && tie.winner !== tie.a && 'opacity-50', tie.winner === tie.a && 'font-semibold')}><TeamBadge team={A} size={22} /><span className="truncate">{A.ru}</span></span>
    </div>
  );
}

function Scorers({ L }: { L: League }) {
  const [stat, setStat] = useKeep<'g' | 'a' | 'ga' | 'rt' | 'cs'>('ucl.stat', 'g');
  const key = statKey(L.season, UCL);
  const list = useMemo(() => leaders(L, key, stat, 25), [L.date, key, stat]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="mt-1"><Chips value={stat} onChange={setStat} options={[{ v: 'g', label: 'Голы' }, { v: 'a', label: 'Передачи' }, { v: 'ga', label: 'Гол + пас' }, { v: 'rt', label: 'Оценка' }, { v: 'cs', label: 'Сухие матчи' }]} /></div>
      {list.length ? (
        <Card pad={false} className="mt-3 overflow-hidden">
          {list.map(({ p, v }, i) => <PlayerRow key={p.id} dense p={p} sub={<>{i + 1}. {clubLabel(L, p)} · {ROLE_RU[p.role]} · {p.stats[key].gp} матч.</>} right={<span className="num text-[19px] mr-2 accent-text">{stat === 'rt' ? v.toFixed(2) : v}</span>} />)}
        </Card>
      ) : <Empty title="Турнир ещё не начался" text="Первый тур общего этапа — в начале сентября." />}
    </>
  );
}
