import { useEffect, useMemo, useState } from 'react';
import { club, gameLabel } from '../../engine/ucl';
import { motion } from 'motion/react';
import { afterStop, useGame, useL } from '../../store/game';
import { EVENT_ICON, LiveMatchScreen } from './LiveMatch';
import { useNav } from '../../store/nav';
import { lastUserBox } from '../../engine/season';
import { Button, Card, cx, Ovr, SectionTitle, Segmented } from '../components/kit';
import { Icon } from '../components/shell';
import { TeamBadge } from '../components/media';
import { Momentum, ShotMap } from '../components/charts';
import { dateLong, dispName, ROLE_RU } from '../format';
import { horn } from '../sound';

const ICON = EVENT_ICON;

export function MatchScreen({ params }: { params: Record<string, unknown> }) {
  const [after, setAfter] = useState<{ v: unknown } | null>(params.interactive ? null : { v: params.after });
  if (!after) {
    return <LiveMatchScreen id={Number(params.id)} onDone={() => {
      // A final won or the last round of the league: the celebration or the table come after the review.
      const L = useGame.getState().L!;
      setAfter({ v: L.stops.find((s) => s === 'cup' || s === 'ucl' || s === 'season-end') ?? params.after ?? null });
    }} />;
  }
  return <MatchReview params={{ id: params.id, live: params.live, after: after.v }} />;
}

function MatchReview({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const closeModal = useNav((s) => s.closeModal);
  // A trophy or the final table waits until the replay is closed.
  const close = () => { closeModal(); if (params.after !== undefined) afterStop((params.after as string | null) ?? null); };
  const push = useNav((s) => s.push);
  const g = L.games.find((x) => x.id === Number(params.id));
  const box = lastUserBox && g && lastUserBox.game.id === g.id ? lastUserBox.box : null;
  const total = box?.result.et ? 120 : 90;
  const [minute, setMinute] = useState(params.live && box ? 0 : 999);
  const [speed, setSpeed] = useState<'1' | '3'>('1');
  const [tab, setTab] = useState<'events' | 'stats' | 'players'>('events');
  const live = minute <= total;
  useEffect(() => {
    if (!live || !box) return;
    const id = setInterval(() => setMinute((m) => m + 1), speed === '1' ? 420 : 140);
    return () => clearInterval(id);
  }, [live, speed, box]);
  const shown = useMemo(() => (box ? box.result.events.filter((e) => e.m <= minute) : []), [box, minute]);
  const goalsNow = shown.filter((e) => e.type === 'goal' || e.type === 'pen').length;
  useEffect(() => { if (live && goalsNow && L.settings.sound) horn(); }, [goalsNow]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!g) return null;
  const H = club(L, g.h), A = club(L, g.a);
  const last = [...shown].reverse().find((e) => e.score);
  const score = live ? last?.score ?? [0, 0] : [g.hs ?? 0, g.as ?? 0];
  const r = box?.result;
  const comp = gameLabel(g);
  const rows = box ? [...box.players].sort((a, b) => Number(b.home) - Number(a.home) || Number(b.started) - Number(a.started) || b.rt - a.rt) : [];
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: '#05070d' }}>
      <div className="absolute inset-0 opacity-70 pointer-events-none" style={{ background: `linear-gradient(100deg, color-mix(in oklab, ${H.primary} 45%, transparent), transparent 45%, transparent 55%, color-mix(in oklab, ${A.primary} 45%, transparent))` }} />
      <header className="relative pt-safe px-2 shrink-0">
        <div className="flex items-center h-12">
          <button onClick={close} className="press w-11 h-11 flex items-center justify-center" aria-label="Закрыть"><Icon name="close" /></button>
          <div className="flex-1 text-center text-[12.5px] text-muted">{comp} · {dateLong(g.day)}</div>
          <div className="w-11" />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-3">
          <div className="flex flex-col items-center gap-1 min-w-0"><TeamBadge team={H} size={52} /><div className="font-display uppercase text-[15px] truncate max-w-full">{H.ru}</div></div>
          <div className="text-center">
            <motion.div key={`${score[0]}-${score[1]}`} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="num text-[46px] leading-none">{score[0]}:{score[1]}</motion.div>
            <div className="text-[12px] text-muted mt-1">{live ? <span className="text-good pulse-soft">{Math.min(minute, total)}'</span> : g.pen ? `по пенальти ${g.pen[0]}:${g.pen[1]}` : g.et ? 'после доп. времени' : 'матч окончен'}</div>
          </div>
          <div className="flex flex-col items-center gap-1 min-w-0"><TeamBadge team={A} size={52} /><div className="font-display uppercase text-[15px] truncate max-w-full">{A.ru}</div></div>
        </div>
        {live && (
          <div className="flex items-center gap-2 px-3 pb-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full accent-bg" style={{ width: `${(Math.min(minute, total) / total) * 100}%` }} /></div>
            <Segmented value={speed} onChange={setSpeed} options={[{ v: '1', label: '×1' }, { v: '3', label: '×3' }]} className="w-[96px]" />
            <Button size="sm" onClick={() => setMinute(999)}>К итогу</Button>
          </div>
        )}
        {!live && box && <div className="px-3 pb-2"><Segmented value={tab} onChange={setTab} options={[{ v: 'events', label: 'События' }, { v: 'stats', label: 'Статистика' }, { v: 'players', label: 'Оценки' }]} /></div>}
      </header>
      <div className="relative scroll flex-1 px-4 pb-safe">
        {!box && (
          <Card className="mt-2">
            <Stat l="Удары" a={g.shH ?? 0} b={g.shA ?? 0} />
            {g.xg && <Stat l="Ожидаемые голы (xG)" a={g.xg[0] / 100} b={g.xg[1] / 100} digits={2} />}
            {g.mom != null && L.players[g.mom] && <div className="text-[14px] mt-3 text-center">Лучший игрок матча — <button className="accent-text" onClick={() => { close(); push('player', { id: g.mom }); }}>{dispName(L.players[g.mom])}</button></div>}
            <div className="text-[12px] text-muted text-center mt-3">Подробный протокол хранится для последнего матча вашей команды.</div>
          </Card>
        )}
        {box && (live || tab === 'events') && (
          <div className="flex flex-col gap-1.5 mt-2">
            {[...shown].reverse().map((e, i) => {
              const home = e.team === g.h, neutral = !e.team;
              const big = e.type === 'goal' || e.type === 'pen';
              return (
                <motion.div key={`${e.m}-${i}-${e.text}`} initial={live ? { opacity: 0, y: -8 } : false} animate={{ opacity: 1, y: 0 }} className={cx('flex items-center gap-2 rounded-2xl px-3 py-2 text-[14px]', neutral ? 'justify-center text-muted text-[12.5px]' : home ? 'glass mr-8' : 'glass ml-8 flex-row-reverse text-right', big && 'border-good/40')}>
                  {!neutral && <span className="num text-[13px] text-muted w-8 shrink-0">{e.m}'</span>}
                  <span className="shrink-0">{ICON[e.type] ?? '•'}</span>
                  <span className={cx('min-w-0', big && 'font-semibold')}>{e.text}{e.score && big ? <span className="num ml-1.5 text-muted">{e.score[0]}:{e.score[1]}</span> : null}</span>
                </motion.div>
              );
            })}
          </div>
        )}
        {box && r && !live && tab === 'stats' && (
          <>
            <Card className="mt-2">
              <Stat l="Владение, %" a={Math.round(r.posH * 100)} b={100 - Math.round(r.posH * 100)} />
              <Stat l="Удары" a={r.shH} b={r.shA} />
              <Stat l="В створ" a={r.onH} b={r.onA} />
              <Stat l="Ожидаемые голы (xG)" a={r.xgH} b={r.xgA} digits={2} />
              <Stat l="Жёлтые карточки" a={box.players.filter((p) => p.home && p.yc).length} b={box.players.filter((p) => !p.home && p.yc).length} />
            </Card>
            <SectionTitle>Карта ударов</SectionTitle>
            <ShotMap shots={r.shotsMap} home={g.h} colors={[H.primary === A.primary ? '#ffffff' : H.primary, A.primary]} />
            <div className="text-[11.5px] text-muted mt-1.5">Закрашенный круг — гол. Чем больше круг, тем опаснее момент. «{H.ru}» атакует вправо.</div>
            <SectionTitle>Ход игры</SectionTitle>
            <Card><Momentum bins={r.momentum} home={H.short} away={A.short} /></Card>
          </>
        )}
        {box && !live && tab === 'players' && (
          <>
            {[true, false].map((home) => (
              <div key={String(home)}>
                <SectionTitle>{home ? H.ru : A.ru}</SectionTitle>
                <Card pad={false} className="overflow-hidden">
                  {rows.filter((p) => p.home === home).map((p) => (
                    <div key={p.id} onClick={() => { close(); push('player', { id: p.id }); }} className="press flex items-center gap-2.5 px-3 min-h-[44px] border-b border-white/5 last:border-0 text-[14px]">
                      <span className="text-[11px] text-muted w-8">{ROLE_RU[p.slot]}</span>
                      <span className={cx('flex-1 truncate', !p.started && 'text-ink/70')}>{dispName(p.p)}{!p.started ? ` ↑${p.on}'` : p.off ? ` ↓${p.off}'` : ''}</span>
                      <span className="text-[12.5px]">{'⚽'.repeat(Math.min(4, p.g))}{p.a ? ` 🅰${p.a > 1 ? p.a : ''}` : ''}{p.rc || p.yc === 2 ? ' 🟥' : p.yc ? ' 🟨' : ''}{r?.mom === p.id ? ' ⭐' : ''}</span>
                      <Ovr v={Math.round(p.rt * 10) / 10 as number} size={34} className={p.rt >= 7.5 ? '!text-good' : p.rt < 6 ? '!text-bad' : '!text-ink'} />
                    </div>
                  ))}
                </Card>
              </div>
            ))}
            <div className="text-[11.5px] text-muted mt-2">В матче сыграли ровно те игроки, которые были в заявленном составе; ↑ — вышел на замену, ↓ — заменён.</div>
          </>
        )}
        <div className="h-10" />
      </div>
    </div>
  );
}

function Stat({ l, a, b, digits = 0 }: { l: string; a: number; b: number; digits?: number }) {
  const sum = a + b || 1;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-[14px] tnum"><span className="num text-[16px]">{a.toFixed(digits)}</span><span className="text-muted text-[12.5px]">{l}</span><span className="num text-[16px]">{b.toFixed(digits)}</span></div>
      <div className="flex gap-1 mt-1 h-1.5">
        <div className="flex-1 flex justify-end rounded-full bg-white/8 overflow-hidden"><div className="h-full accent-bg rounded-full" style={{ width: `${(a / sum) * 100}%` }} /></div>
        <div className="flex-1 rounded-full bg-white/8 overflow-hidden"><div className="h-full rounded-full bg-[#8b98ae]" style={{ width: `${(b / sum) * 100}%` }} /></div>
      </div>
    </div>
  );
}
