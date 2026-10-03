import { AnimatePresence, motion } from 'motion/react';
import { useGame } from './store/game';
import { useNav, type Tab } from './store/nav';
import { TabBar, Toasts } from './ui/components/shell';
import { Menu } from './ui/screens/Menu';
import { ROUTES, MODALS } from './ui/routes';
import { SimOverlay } from './ui/screens/SimOverlay';
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
  const month = Number(L.date.slice(5, 7));
  const mood = month === 12 || month <= 2 ? 'winter' : '';
  return (
    <>
      <div className="arena" data-mood={mood} />
      <div className="fixed inset-0 overflow-hidden">
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
            <Comp params={route.params ?? {}} />
          </motion.div>
        </AnimatePresence>
      </div>
      <TabBar badges={badges} />
      <SimOverlay />
      <AnimatePresence>
        {ModalComp && (
          <motion.div
            key={modal!.key}
            className="fixed inset-0 z-50"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 36 }}
          >
            <ModalComp params={modal!.params ?? {}} />
          </motion.div>
        )}
      </AnimatePresence>
      <Toasts />
    </>
  );
}
