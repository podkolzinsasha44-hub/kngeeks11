import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { applyLive, startLive } from '../../engine/season';
import { club, gameLabel } from '../../engine/ucl';
import type { LiveMatch } from '../../engine/match';
import type { GameEvent, Tactic } from '../../engine/types';
import { useGame, useL } from '../../store/game';
import { Button, Card, cx, Segmented } from '../components/kit';
import { Icon, Sheet } from '../components/shell';
import { PlayerPhoto, TeamBadge } from '../components/media';
import { dateLong, dispName, ROLE_RU } from '../format';
import { horn } from '../sound';

export const EVENT_ICON: Partial<Record<GameEvent['type'], string>> = { goal: '⚽', pen: '⚽', yellow: '🟨', red: '🟥', sub: '🔁', injury: '✚', save: '🧤', chance: '💨', penmiss: '❌', half: '⏸', end: '🏁', shootout: '🎯', kickoff: '▶️', tactic: '📋' };

// One match per game id: a re-render (or React's double rendering in development) never starts it twice.
const running = new Map<number, LiveMatch>();
const SPEED = { '1': 450, '3': 150, '10': 40 } as const;

/**
 * The user's match played live: the engine plays one minute per tick and the user can change the
 * tactic and make substitutions from his bench at any moment. Both teams go through the same engine.
 */
export function LiveMatchScreen({ id, onDone }: { id: number; onDone: () => void }) {
  const L = useL();
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const g = L.games.find((x) => x.id === id)!;
  const live = useMemo(() => { let m = running.get(id); if (!m) { m = startLive(L, g); running.set(id, m); } return m; }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, setV] = useState(0);
  const [speed, setSpeed] = useState<keyof typeof SPEED>('1');
  const [paused, setPaused] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const home = g.h === L.user;
  const H = club(L, g.h), A = club(L, g.a);
  const me = live.view(home);

  const finish = () => {
    while (!live.done) live.tick();
    running.delete(id);
    act((Lg) => applyLive(Lg, g, live.box!));
    onDone();
  };

  useEffect(() => {
    if (paused || live.done) return;
    const t = setInterval(() => {
      const before = live.score().join(':');
      live.tick();
      // Half-time: a moment for decisions.
      if (live.minute === 45 && !live.done) setPaused(true);
      if (live.score().join(':') !== before && L.settings.sound) horn();
      setV((v) => v + 1);
      if (live.done) clearInterval(t);
    }, SPEED[speed]);
    return () => clearInterval(t);
  }, [paused, speed, live]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (live.done) finish(); }, [live.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = live.score();
  const mineGoals = home ? score[0] : score[1], theirGoals = home ? score[1] : score[0];
  const opp = live.view(!home);
  const poss = live.possession();
  const setTactic = (t: Tactic) => { live.setTactic(home, t); setV((v) => v + 1); };
  const events = [...live.events].reverse();
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: '#05070d' }}>
      <div className="absolute inset-0 opacity-70 pointer-events-none" style={{ background: `linear-gradient(100deg, color-mix(in oklab, ${H.primary} 45%, transparent), transparent 45%, transparent 55%, color-mix(in oklab, ${A.primary} 45%, transparent))` }} />
      <header className="relative pt-safe px-2 shrink-0">
        <div className="flex items-center h-12">
          <button onClick={finish} className="press h-11 px-3 flex items-center gap-1 text-[13px] text-muted" aria-label="Досыграть"><Icon name="ff" size={16} /> Итог</button>
          <div className="flex-1 text-center text-[12.5px] text-muted truncate">{gameLabel(g)} · {dateLong(g.day)}</div>
          <div className="w-[72px]" />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-2">
          <div className="flex flex-col items-center gap-1 min-w-0"><TeamBadge team={H} size={48} /><div className="font-display uppercase text-[14px] truncate max-w-full">{H.ru}</div></div>
          <div className="text-center">
            <motion.div key={score.join('-')} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="num text-[46px] leading-none">{score[0]}:{score[1]}</motion.div>
            <div className="text-[12px] mt-1">{paused && live.minute === 45 ? <span className="text-warn">перерыв</span> : <span className="text-good pulse-soft">{Math.max(1, live.minute)}'</span>}</div>
          </div>
          <div className="flex flex-col items-center gap-1 min-w-0"><TeamBadge team={A} size={48} /><div className="font-display uppercase text-[14px] truncate max-w-full">{A.ru}</div></div>
        </div>
        <div className="px-3 pb-2">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full accent-bg" style={{ width: `${(Math.min(live.minute, 90) / 90) * 100}%` }} /></div>
          <div className="grid grid-cols-4 gap-1 mt-2 text-center text-[11px] text-muted tnum">
            <div><div className="num text-[14px] text-ink">{Math.round(poss * 100)}–{100 - Math.round(poss * 100)}</div>владение</div>
            <div><div className="num text-[14px] text-ink">{(home ? me : opp).shots}–{(home ? opp : me).shots}</div>удары</div>
            <div><div className="num text-[14px] text-ink">{(home ? me : opp).onT}–{(home ? opp : me).onT}</div>в створ</div>
            <div><div className="num text-[14px] text-ink">{(home ? me : opp).xg.toFixed(1)}–{(home ? opp : me).xg.toFixed(1)}</div>xG</div>
          </div>
        </div>
      </header>

      <div className="relative scroll flex-1 px-4">
        {paused && live.minute === 45 && (
          <Card className="mt-1 mb-2 border-warn/40">
            <div className="text-[14.5px] font-semibold">Перерыв — время решений</div>
            <div className="text-[12.5px] text-muted mt-0.5 leading-snug">
              {mineGoals > theirGoals ? 'Ведём. Можно отойти в оборону и удержать счёт.' : mineGoals < theirGoals ? 'Проигрываем. Атака даст больше моментов — но и у соперника их станет больше.' : 'Ничья. Можно рискнуть и пойти вперёд.'} Посмотрите на свежесть игроков — уставших стоит заменить.
            </div>
          </Card>
        )}
        <div className="flex flex-col gap-1.5 mt-1">
          {events.map((e, i) => {
            const isHome = e.team === g.h, neutral = !e.team;
            const big = e.type === 'goal' || e.type === 'pen';
            return (
              <motion.div key={`${e.m}-${events.length - i}-${e.text}`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={cx('flex items-center gap-2 rounded-2xl px-3 py-2 text-[14px]', neutral ? 'justify-center text-muted text-[12.5px]' : isHome ? 'glass mr-8' : 'glass ml-8 flex-row-reverse text-right', big && 'border-good/40')}>
                {!neutral && <span className="num text-[13px] text-muted w-8 shrink-0">{e.m}'</span>}
                <span className="shrink-0">{EVENT_ICON[e.type] ?? '•'}</span>
                <span className={cx('min-w-0', big && 'font-semibold')}>{e.text}{e.score && big ? <span className="num ml-1.5 text-muted">{e.score[0]}:{e.score[1]}</span> : null}</span>
              </motion.div>
            );
          })}
        </div>
        <div className="h-6" />
      </div>

      <div className="relative shrink-0 px-3 pt-2 pb-safe glass-strong rounded-t-[24px]">
        <div className="flex items-center gap-2">
          <Segmented<Tactic> className="flex-1" value={me.tactic} onChange={setTactic} options={[{ v: 'defense', label: 'Оборона' }, { v: 'balanced', label: 'Баланс' }, { v: 'attack', label: 'Атака' }]} />
        </div>
        <div className="flex items-center gap-2 mt-2 mb-2">
          <Button size="sm" onClick={() => setPaused(!paused)} icon={<Icon name={paused ? 'play' : 'pause'} size={15} />}>{paused ? 'Играть' : 'Пауза'}</Button>
          <Button size="sm" disabled={me.subs >= me.maxSubs} onClick={() => { setPaused(true); setSubOpen(true); }} icon={<Icon name="swap" size={15} />}>Замена {me.subs}/{me.maxSubs}</Button>
          <Segmented<keyof typeof SPEED> className="flex-1" value={speed} onChange={setSpeed} options={[{ v: '1', label: '×1' }, { v: '3', label: '×3' }, { v: '10', label: '×10' }]} />
        </div>
      </div>
      {subOpen && <SubSheet live={live} home={home} onClose={() => { setSubOpen(false); setV((v) => v + 1); }} onDone={(text) => toast(text, 'good')} />}
    </div>
  );
}

/** Two taps: who leaves, who comes on. Freshness and the match rating so far help to choose. */
function SubSheet({ live, home, onClose, onDone }: { live: LiveMatch; home: boolean; onClose: () => void; onDone: (text: string) => void }) {
  const L = useL();
  const [out, setOut] = useState<number | null>(null);
  const v = live.view(home);
  // Condition without form and morale: match fitness and the fatigue of this game.
  const fresh = (c: number, p: { form: number; morale: number }) => Math.round(Math.min(100, (c / (1 + p.form * 0.02 + (p.morale - 65) / 3000)) * 100));
  return (
    <Sheet open onClose={onClose} title={out == null ? 'Кого заменить?' : 'Кто выходит?'} full>
      {out == null ? (
        <div className="flex flex-col">
          {v.on.map((x) => {
            const f = fresh(x.cond, x.p);
            return (
              <button key={x.p.id} onClick={() => setOut(x.p.id)} className="press flex items-center gap-3 py-2 border-b border-white/5 text-left">
                <span className="w-9 text-[12px] text-muted">{ROLE_RU[x.slot]}</span>
                <PlayerPhoto L={L} p={x.p} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[14.5px]">{dispName(x.p)} {x.st.yc ? '🟨' : ''}{x.st.g ? ' ⚽'.repeat(Math.min(3, x.st.g)) : ''}</div>
                  <div className="text-[12px] text-muted">{x.p.ovr} · на поле с {x.st.on || 1}'</div>
                </div>
                <span className={cx('num text-[14px]', f < 90 ? 'text-bad' : f < 95 ? 'text-warn' : 'text-good')}>{f}%</span>
              </button>
            );
          })}
          <div className="text-[11.5px] text-muted mt-2">Процент — свежесть с учётом усталости по ходу матча. Если вы не делаете замен, штаб проведёт их сам.</div>
        </div>
      ) : (
        <div className="flex flex-col">
          {v.bench.length ? v.bench.map((p) => (
            <button key={p.id} onClick={() => { const o = live.view(home).on.find((x) => x.p.id === out)!.p; if (live.sub(home, out, p.id)) onDone(`${dispName(p)} вместо ${dispName(o)}`); onClose(); }} className="press flex items-center gap-3 py-2 border-b border-white/5 text-left">
              <PlayerPhoto L={L} p={p} size={36} />
              <div className="flex-1 min-w-0">
                <div className="truncate text-[14.5px]">{dispName(p)}</div>
                <div className="text-[12px] text-muted">{ROLE_RU[p.role]} · {p.ovr} · готовность {Math.round(p.fit)}%</div>
              </div>
            </button>
          )) : <div className="text-muted text-[14px]">На скамейке никого не осталось.</div>}
          <Button variant="ghost" className="mt-3" onClick={() => setOut(null)}>Назад</Button>
        </div>
      )}
    </Sheet>
  );
}
