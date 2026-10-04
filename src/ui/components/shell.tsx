import { AnimatePresence, motion } from 'motion/react';
import { useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNav, type Tab } from '../../store/nav';
import { useGame } from '../../store/game';
import { cx } from './kit';
import { RouteKey, saveScroll, scrollOf } from '../keep';

const DESKTOP = '(min-width: 1024px)';
const subscribeDesktop = (cb: () => void) => {
  const m = window.matchMedia(DESKTOP);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
/** True on a wide screen (PC): sidebar navigation, two-column screens, dialogs instead of bottom sheets. */
export const useDesktop = () => useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);

export function Icon({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  switch (name) {
    case 'office': return <svg {...p}><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18" /></svg>;
    case 'roster': return <svg {...p}><path d="M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 01-8 0z" /></svg>;
    case 'market': return <svg {...p}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>;
    case 'league': return <svg {...p}><path d="M7 4h10v4a5 5 0 01-10 0V4zM5 5H3v2a3 3 0 003 3M19 5h2v2a3 3 0 01-3 3M12 13v4M8 21h8M9 17h6" /></svg>;
    case 'more': return <svg {...p}><rect x="4" y="4" width="6" height="6" rx="2" /><rect x="14" y="4" width="6" height="6" rx="2" /><rect x="4" y="14" width="6" height="6" rx="2" /><rect x="14" y="14" width="6" height="6" rx="2" /></svg>;
    case 'back': return <svg {...p} strokeWidth={2.2}><path d="M15 5l-7 7 7 7" /></svg>;
    case 'close': return <svg {...p} strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case 'play': return <svg {...p} fill="currentColor" stroke="none"><path d="M7 4.5v15a1 1 0 001.5.86l12-7.5a1 1 0 000-1.72l-12-7.5A1 1 0 007 4.5z" /></svg>;
    case 'ff': return <svg {...p} fill="currentColor" stroke="none"><path d="M3 5v14l9-7zM12 5v14l9-7z" /></svg>;
    case 'pause': return <svg {...p} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>;
    case 'mail': return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></svg>;
    case 'star': return <svg {...p}><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>;
    case 'search': return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>;
    case 'plus': return <svg {...p} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>;
    case 'swap': return <svg {...p}><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>;
    case 'share': return <svg {...p}><path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" /></svg>;
    case 'info': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>;
    case 'filter': return <svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
    case 'check': return <svg {...p} strokeWidth={2.4}><path d="M5 12l5 5 9-10" /></svg>;
    case 'eye': return <svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'cup': return <svg {...p}><path d="M8 3h8v5a4 4 0 01-8 0V3zM12 12v4M9 16h6l1 5H8z" /></svg>;
    case 'sliders': return <svg {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

export function Screen({
  title, subtitle, right, children, back, onBack, className, noPad, large = false, headerExtra,
}: {
  title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; back?: boolean; onBack?: () => void; className?: string; noPad?: boolean; large?: boolean; headerExtra?: ReactNode;
}) {
  const pop = useNav((s) => s.pop);
  const canBack = useNav((s) => s.stacks[s.tab].length > 1);
  const showBack = back ?? canBack;
  const routeKey = useContext(RouteKey);
  const mainRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(() => scrollOf(routeKey) > 6);
  const touch = useRef<{ x: number; y: number } | null>(null);
  // Coming back to a screen puts it where it was left.
  useLayoutEffect(() => {
    const y = scrollOf(routeKey);
    if (y && mainRef.current) mainRef.current.scrollTop = y;
  }, [routeKey]);
  return (
    <div
      className="absolute inset-0 flex flex-col"
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t.clientX < 24 && showBack) touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const t = e.changedTouches[0];
        if (t.clientX - s.x > 70 && Math.abs(t.clientY - s.y) < 60) (onBack ?? pop)();
      }}
    >
      <header className={cx('pt-safe z-20 shrink-0 transition-colors duration-300', scrolled ? 'glass-strong border-x-0 border-t-0' : 'border-b border-transparent')}>
        <div className="flex items-center gap-2 h-12 px-2 lg:h-16 lg:px-6 w-full lg:max-w-[1240px] lg:mx-auto">
          {showBack ? (
            <button onClick={onBack ?? pop} className="press w-11 h-11 -ml-0.5 flex items-center justify-center rounded-full text-ink" aria-label="Назад">
              <Icon name="back" />
            </button>
          ) : (
            <div className="w-2" />
          )}
          <div className="flex-1 min-w-0">
            {!large && title && <div className="font-display uppercase tracking-wide text-[18px] lg:text-[22px] truncate leading-tight">{title}</div>}
            {!large && subtitle && <div className="text-[12px] lg:text-[13px] text-muted truncate leading-tight">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-1 pr-1">{right}</div>
        </div>
        {headerExtra && <div className="lg:max-w-[1240px] lg:mx-auto lg:px-4 w-full">{headerExtra}</div>}
      </header>
      <main ref={mainRef} className={cx('scroll flex-1', !noPad && 'px-4 lg:px-10', className)} onScroll={(e) => { const y = e.currentTarget.scrollTop; setScrolled(y > 6); if (routeKey) saveScroll(routeKey, y); }}>
        <div className="lg:max-w-[1180px] lg:mx-auto">
        {large && (
          <div className="pt-1 pb-3">
            <div className="font-display uppercase text-[30px] lg:text-[40px] leading-none tracking-wide">{title}</div>
            {subtitle && <div className="text-muted text-[14px] mt-1.5">{subtitle}</div>}
          </div>
        )}
        {children}
        </div>
        <div className="h-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+96px)] lg:h-12" />
      </main>
    </div>
  );
}

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'office', label: 'Офис', icon: 'office' },
  { id: 'roster', label: 'Состав', icon: 'roster' },
  { id: 'market', label: 'Рынок', icon: 'market' },
  { id: 'league', label: 'Лига', icon: 'league' },
  { id: 'more', label: 'Ещё', icon: 'more' },
];


export function TabBar({ badges }: { badges: Partial<Record<Tab, number>> }) {
  const tab = useNav((s) => s.tab);
  const setTab = useNav((s) => s.setTab);
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 glass-strong border-x-0 border-b-0 pb-safe lg:hidden">
      <div className="flex h-[56px] max-w-[560px] mx-auto">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className="press relative flex-1 flex flex-col items-center justify-center gap-0.5" aria-label={t.label}>
              {active && <motion.div layoutId="tab-glow" className="absolute top-0 w-10 h-[3px] rounded-b-full accent-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              <Icon name={t.icon} size={24} className={active ? 'accent-text' : 'text-muted'} />
              <span className={cx('text-[10.5px] font-medium', active ? 'text-ink' : 'text-muted')}>{t.label}</span>
              {!!badges[t.id] && (
                <span className="absolute top-1.5 left-1/2 ml-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-bad text-white text-[10.5px] font-semibold flex items-center justify-center">{badges[t.id]}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function Sheet({ open, onClose, title, children, full }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; full?: boolean }) {
  const desktop = useDesktop();
  // Esc closes the sheet before anything underneath reacts to it.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [open, onClose]);
  // Rendered at the document root: a parent with backdrop-filter (the PC sidebar) would trap a fixed overlay.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div data-sheet className={cx('fixed inset-0 z-[60]', desktop && 'flex items-center justify-center p-8')}>
          <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          {desktop ? (
            <motion.div
              className={cx('relative glass-strong rounded-[28px] flex flex-col w-full max-w-[600px] shadow-2xl', full ? 'h-[86dvh]' : 'max-h-[86dvh]')}
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <div className="flex items-center gap-3 px-6 pt-5 pb-3 shrink-0">
                <div className="flex-1 font-display uppercase tracking-wide text-[20px] truncate">{title}</div>
                <button onClick={onClose} className="press w-10 h-10 rounded-full glass flex items-center justify-center" aria-label="Закрыть"><Icon name="close" size={18} /></button>
              </div>
              <div className="scroll px-6 flex-1">
                {children}
                <div className="h-6" />
              </div>
            </motion.div>
          ) : (
            <motion.div
              className={cx('absolute inset-x-0 bottom-0 glass-strong rounded-t-[28px] flex flex-col border-b-0 max-w-[620px] mx-auto', full ? 'h-[92dvh]' : 'max-h-[88dvh]')}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose(); }}
            >
              <div className="pt-2.5 pb-1 flex justify-center shrink-0"><div className="w-10 h-1.5 rounded-full bg-white/25" /></div>
              {title && <div className="px-5 pb-2 pt-1 font-display uppercase tracking-wide text-[18px] shrink-0">{title}</div>}
              <div className="scroll px-4 pb-safe flex-1" onPointerDownCapture={(e) => e.stopPropagation()}>
                {children}
                <div className="h-5" />
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="fixed top-0 inset-x-0 z-[80] pt-safe pointer-events-none flex flex-col items-center gap-2 px-4 lg:items-end lg:pt-5 lg:px-6">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            className={cx('glass-strong rounded-2xl px-4 py-3 text-[14.5px] max-w-[440px] w-full shadow-xl', t.kind === 'good' && 'border-good/40', t.kind === 'bad' && 'border-bad/40')}
          >
            {t.kind === 'good' ? '✅ ' : t.kind === 'bad' ? '⚠️ ' : ''}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Dialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <motion.div className="absolute inset-0 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="relative glass-strong rounded-3xl p-5 w-full max-w-[380px]" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
