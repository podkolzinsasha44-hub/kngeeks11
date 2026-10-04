import { motion } from 'motion/react';
import { useState } from 'react';
import { useGame } from '../../store/game';
import { useNav, type Tab } from '../../store/nav';
import { LEAGUES } from '../../engine/leagues';
import { nextUserGame } from '../../engine/season';
import { dateLong, dateShort, seasonLabel } from '../format';
import { cx } from './kit';
import { TeamBadge } from './media';
import { Icon, TABS } from './shell';
import { SimSheet } from '../screens/SimOverlay';

/** Left navigation of the PC version: club, sections, and the "Continue" button. */
export function Sidebar({ badges }: { badges: Partial<Record<Tab, number>> }) {
  const L = useGame((s) => s.L)!;
  useGame((s) => s.ver);
  const sim = useGame((s) => s.sim);
  const simulate = useGame((s) => s.simulate);
  const stop = useGame((s) => s.stopSim);
  const tab = useNav((s) => s.tab);
  const setTab = useNav((s) => s.setTab);
  const [open, setOpen] = useState(false);
  const t = L.teams[L.user];
  const ng = nextUserGame(L);
  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 hidden lg:flex flex-col glass-strong border-y-0 border-l-0" style={{ width: 'var(--side-w)' }}>
      <div className="px-5 pt-6 pb-4">
        <div className="font-display uppercase tracking-[0.2em] text-[12px] text-muted">Football GM</div>
        <div className="flex items-center gap-3 mt-4">
          <TeamBadge team={t} size={44} />
          <div className="min-w-0">
            <div className="font-display uppercase text-[18px] leading-tight truncate">{t.ru}</div>
            <div className="text-[12px] text-muted truncate">{LEAGUES[t.lg].short} · {seasonLabel(L.season)}</div>
          </div>
        </div>
        <div className="text-[12.5px] text-faint mt-2">{dateLong(L.date)}</div>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {TABS.map((x, i) => {
          const active = x.id === tab;
          return (
            <button key={x.id} onClick={() => setTab(x.id)} className={cx('press relative flex items-center gap-3 h-11 px-3 rounded-xl text-left', active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]')}>
              {active && <motion.div layoutId="side-glow" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full accent-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <Icon name={x.icon} size={21} className={active ? 'accent-text' : 'text-muted'} />
              <span className={cx('flex-1 text-[15px]', active ? 'text-ink font-medium' : 'text-ink/75')}>{x.label}</span>
              {!!badges[x.id] && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-bad text-white text-[11px] font-semibold flex items-center justify-center">{badges[x.id]}</span>}
              <kbd>{i + 1}</kbd>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto p-4 flex flex-col gap-2">
        {sim ? (
          <button onClick={stop} className="press h-[56px] rounded-[18px] glass flex items-center justify-center gap-2 font-display uppercase tracking-wider text-[16px]">
            <Icon name="pause" size={18} /> Стоп
          </button>
        ) : (
          <>
            <button onClick={() => simulate(ng ? 'game' : 'event')} className="press h-[60px] rounded-[18px] accent-bg flex items-center gap-3 px-4 shadow-[0_14px_40px_-12px_var(--accent)] text-white text-left">
              <Icon name="play" size={20} />
              <div className="flex-1 min-w-0 leading-tight">
                <div className="font-display uppercase tracking-wider text-[17px]">Продолжить</div>
                {ng && <div className="text-[11.5px] text-white/85 truncate">матч {dateShort(ng.day)} · {L.teams[ng.h === L.user ? ng.a : ng.h]?.ru}</div>}
              </div>
              <kbd className="!bg-white/20 !text-white">Пробел</kbd>
            </button>
            <button onClick={() => setOpen(true)} className="press h-11 rounded-[14px] glass flex items-center justify-center gap-2 text-[14px]">
              <Icon name="ff" size={16} /> Режимы симуляции
            </button>
          </>
        )}
      </div>
      <SimSheet open={open} onClose={() => setOpen(false)} />
    </aside>
  );
}
