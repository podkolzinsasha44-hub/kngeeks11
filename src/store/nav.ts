import { create } from 'zustand';

export type Tab = 'office' | 'roster' | 'market' | 'league' | 'more';
export interface Route {
  name: string;
  params?: Record<string, unknown>;
  key: number;
}

const ROOT: Record<Tab, string> = { office: 'office', roster: 'roster', market: 'market', league: 'league', more: 'more' };
let k = 1;
const root = (t: Tab): Route[] => [{ name: ROOT[t], key: k++ }];

interface NavState {
  tab: Tab;
  stacks: Record<Tab, Route[]>;
  dir: 1 | -1;
  /** Full-screen modal route above everything (match, celebration, wrapped...). */
  modal: Route | null;
  push: (name: string, params?: Record<string, unknown>) => void;
  pop: () => void;
  setTab: (t: Tab) => void;
  go: (t: Tab, name?: string, params?: Record<string, unknown>) => void;
  openModal: (name: string, params?: Record<string, unknown>) => void;
  closeModal: () => void;
  reset: () => void;
}

export const useNav = create<NavState>((set, get) => ({
  tab: 'office',
  stacks: { office: root('office'), roster: root('roster'), market: root('market'), league: root('league'), more: root('more') },
  dir: 1,
  modal: null,
  push: (name, params) => {
    const { tab, stacks } = get();
    set({ dir: 1, stacks: { ...stacks, [tab]: [...stacks[tab], { name, params, key: k++ }] } });
  },
  pop: () => {
    const { tab, stacks } = get();
    if (stacks[tab].length <= 1) return;
    set({ dir: -1, stacks: { ...stacks, [tab]: stacks[tab].slice(0, -1) } });
  },
  setTab: (t) => {
    const { tab, stacks } = get();
    if (t === tab) {
      // Tap on active tab → back to root
      set({ dir: -1, stacks: { ...stacks, [t]: stacks[t].slice(0, 1) } });
    } else set({ tab: t, dir: 1 });
  },
  go: (t, name, params) => {
    const { stacks } = get();
    const base = stacks[t].slice(0, 1);
    set({ tab: t, dir: 1, stacks: { ...stacks, [t]: name ? [...base, { name, params, key: k++ }] : base } });
  },
  openModal: (name, params) => set({ modal: { name, params, key: k++ } }),
  closeModal: () => set({ modal: null }),
  reset: () => set({ tab: 'office', modal: null, stacks: { office: root('office'), roster: root('roster'), market: root('market'), league: root('league'), more: root('more') } }),
}));

export function currentRoute() {
  const s = useNav.getState();
  const st = s.stacks[s.tab];
  return st[st.length - 1];
}
