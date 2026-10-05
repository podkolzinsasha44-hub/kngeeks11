import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useGame } from './store/game';
import { useNav, type Tab } from './store/nav';
import { TabBar, TABS, Toasts, useDesktop } from './ui/components/shell';
import { Sidebar } from './ui/components/Sidebar';
import { RouteKey } from './ui/keep';
import { nextUserGame } from './engine/season';
import { Menu } from './ui/screens/Menu';
import { ROUTES, MODALS } from './ui/routes';
import { SimOverlay } from './ui/screens/SimOverlay';
import { ConflictDialog } from './ui/components/Rooms';
import { unreadCount } from './engine/news';

export default function App() {
  const L = useGame((s) => s.L);
  useGame((s) => s.ver);
  if (!L) {
    return (
      <>
        <div className="arena" />
        <Menu />
        <Toasts />
      </>
    );
  }
  return <GameShell />;
}

function GameShell() {
  const L = useGame((s) => s.L)!;
  const tab = useNav((s) => s.tab);
  const stack = useNav((s) => s.stacks[s.tab]);
  const dir = useNav((s) => s.dir);
  const modal = useNav((s) => s.modal);
  const route = stack[stack.length - 1];
  const Comp = ROUTES[route.name] ?? ROUTES.office;
  const badges: Partial<Record<Tab, number>> = {
    office: unreadCount(L),
    market: L.offers.length || undefined,
  };
  const ModalComp = modal ? MODALS[modal.name] : null;
  const desktop = useDesktop();
  useShortcuts();
  const month = Number(L.date.slice(5, 7));
  const mood = month === 12 || month <= 2 ? 'winter' : '';
  return (
    <>
      <div className="arena" data-mood={mood} />
      <div className="fixed top-0 bottom-0 bottom-edge right-0 overflow-hidden" style={{ left: 'var(--side-w)' }}>
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={`${tab}-${route.key}`}
            custom={dir}
            className="absolute inset-0"
            initial={{ x: dir > 0 ? '30%' : '-22%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir > 0 ? '-18%' : '30%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 42, mass: 0.9 }}
          >
            <RouteKey.Provider value={route.key}><Comp params={route.params ?? {}} /></RouteKey.Provider>
          </motion.div>
        </AnimatePresence>
      </div>
      <TabBar badges={badges} />
      <Sidebar badges={badges} />
      <SimOverlay />
      <ConflictDialog />
      <AnimatePresence>
        {ModalComp && (
          desktop ? (
            // On a PC the match centre opens as a window over the dimmed game.
            <motion.div key={modal!.key} className="fixed inset-0 bottom-edge z-50 flex justify-center py-6 px-8 bg-black/65" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="relative w-full max-w-[820px] rounded-[28px] overflow-hidden border border-white/10 shadow-2xl"
                style={{ background: 'var(--color-bg)' }}
                initial={{ y: 30, scale: 0.98 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 30, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              >
                <RouteKey.Provider value={modal!.key}><ModalComp params={modal!.params ?? {}} /></RouteKey.Provider>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key={modal!.key}
              className="fixed inset-0 bottom-edge z-50"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 36 }}
            >
              <RouteKey.Provider value={modal!.key}><ModalComp params={modal!.params ?? {}} /></RouteKey.Provider>
            </motion.div>
          )
        )}
      </AnimatePresence>
      <Toasts />
    </>
  );
}

/** Keyboard on a PC: Space continues (or stops) the simulation, 1–5 switch sections, Esc goes back. */
function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const nav = useNav.getState();
      const g = useGame.getState();
      if (e.key === 'Escape') {
        if (nav.modal) nav.closeModal();
        else nav.pop();
        return;
      }
      if (document.querySelector('[data-sheet]')) return;
      if (e.code === 'Space' && (!el || el === document.body || el.tagName === 'BUTTON')) {
        e.preventDefault();
        // A focused button would also "click" on keyup: take the focus away first.
        if (el && el !== document.body) el.blur();
        if (g.sim?.running) g.stopSim();
        else if (g.L && !nav.modal) g.simulate(nextUserGame(g.L) ? 'game' : 'event');
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length && !nav.modal) nav.setTab(TABS[n - 1].id);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}
