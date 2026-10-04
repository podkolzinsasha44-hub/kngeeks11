import { AnimatePresence, motion } from 'motion/react';
import { club } from '../../engine/ucl';
import { useState } from 'react';
import { useGame, type SimMode } from '../../store/game';
import { nextUserGame } from '../../engine/season';
import { windowOpen } from '../../engine/leagues';
import { dateLong, dateShort, phaseLabel } from '../format';
import { Icon, Sheet } from '../components/shell';
import { Button, Spinner } from '../components/kit';

export function SimOverlay() {
  const sim = useGame((s) => s.sim);
  const L = useGame((s) => s.L)!;
  const stop = useGame((s) => s.stopSim);
  const w = sim?.results.filter((r) => r.res === 'W').length ?? 0, d = sim?.results.filter((r) => r.res === 'D').length ?? 0, l = sim?.results.filter((r) => r.res === 'L').length ?? 0;
  return (
    <AnimatePresence>
      {sim && (
        <motion.div className="fixed dock-x z-50 px-3" style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 10px - var(--vh-gap))' }} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
          <div className="glass-strong rounded-3xl p-3 pl-4 flex items-center gap-3 max-w-[560px] mx-auto shadow-2xl">
            <Spinner size={22} />
            <div className="flex-1 min-w-0">
              <div className="font-display uppercase tracking-wide text-[15px]">{dateLong(L.date)}</div>
              <div className="text-[12.5px] text-muted truncate">
                {sim.last ? <>{sim.last.res === 'W' ? '✅' : sim.last.res === 'D' ? '➖' : '❌'} {club(L, sim.last.game.h).short} {sim.last.game.hs}:{sim.last.game.as} {club(L, sim.last.game.a).short} · {w}–{d}–{l}</> : phaseLabel(L)}
              </div>
            </div>
            <Button size="sm" variant="glass" onClick={stop} icon={<Icon name="pause" size={16} />}>Стоп</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type SimOption = { mode: SimMode; label: string; sub: string; watch?: boolean; show?: boolean };

/** All the ways to move time forward. */
export function SimSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const L = useGame((s) => s.L)!;
  const simulate = useGame((s) => s.simulate);
  const ng = nextUserGame(L);
  const options: SimOption[] = [
    { mode: 'game', label: 'Сыграть следующий матч', sub: 'И открыть матч-центр с повтором', watch: true, show: !!ng },
    { mode: 'event', label: 'До следующего события', sub: 'Остановимся на предложениях, травмах и ключевых датах' },
    { mode: 'day', label: 'Один день', sub: 'Медленно и внимательно' },
    { mode: 'week', label: 'Неделя', sub: '7 дней' },
    { mode: 'window', label: 'До закрытия трансферного окна', sub: 'Последние дни, чтобы усилиться', show: windowOpen(L) },
    { mode: 'season', label: 'До конца сезона', sub: 'Остановки только на главном: состав, кубок, итоги' },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Симуляция">
      <div className="flex flex-col gap-2">
        {options.filter((o) => o.show !== false).map((o) => (
          <button key={o.label} onClick={() => { onClose(); simulate(o.mode, undefined, { watch: o.watch }); }} className="press glass rounded-2xl px-4 py-3 text-left flex items-center gap-3">
            <div className="flex-1">
              <div className="font-semibold text-[15.5px]">{o.label}</div>
              <div className="text-[12.5px] text-muted">{o.sub}</div>
            </div>
            <Icon name="play" size={16} className="text-muted" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** The big "Continue" button above the tab bar (phones; on a PC it lives in the sidebar). */
export function SimDock() {
  const L = useGame((s) => s.L)!;
  useGame((s) => s.ver);
  const sim = useGame((s) => s.sim);
  const simulate = useGame((s) => s.simulate);
  const [open, setOpen] = useState(false);
  const ng = nextUserGame(L);
  if (sim) return null;
  return (
    <>
      <div className="fixed inset-x-0 z-30 px-4 pointer-events-none lg:hidden" style={{ bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 10px - var(--vh-gap))' }}>
        <div className="flex gap-2 max-w-[560px] mx-auto pointer-events-auto">
          <button onClick={() => simulate(ng ? 'game' : 'event')} className="press flex-1 h-[56px] rounded-[20px] accent-bg flex items-center justify-center gap-2.5 shadow-[0_14px_40px_-10px_var(--accent)] text-white">
            <Icon name="play" size={20} />
            <div className="text-left leading-tight">
              <div className="font-display uppercase tracking-wider text-[17px]">Продолжить</div>
              {ng && <div className="text-[11.5px] text-white/85 -mt-0.5">матч {dateShort(ng.day)} · {ng.h === L.user ? 'дома' : 'в гостях'} · {club(L, ng.h === L.user ? ng.a : ng.h)?.ru}</div>}
            </div>
          </button>
          <button onClick={() => setOpen(true)} className="press w-[56px] h-[56px] rounded-[20px] glass-strong flex items-center justify-center" aria-label="Режимы симуляции"><Icon name="ff" size={20} /></button>
        </div>
      </div>
      <SimSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
