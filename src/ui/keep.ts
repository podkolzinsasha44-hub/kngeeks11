// Screen state that survives leaving the screen. Only the top route of a tab is mounted, so a plain
// useState is lost when the user switches tabs or opens a player and comes back. useKeep stores the
// value per route instance (the route key of the navigation stack): returning to the same screen
// brings back its filters, search text, sub-tab and scroll position. Entries of routes that left the
// stacks are dropped.
import { createContext, useCallback, useContext, useState, type Dispatch, type SetStateAction } from 'react';
import { useNav } from '../store/nav';

const mem = new Map<string, unknown>();

/** Key of the route the screen belongs to (provided by the app shell). */
export const RouteKey = createContext(0);

export function useKeep<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const id = `${useContext(RouteKey)}:${name}`;
  const [v, setV] = useState<T>(() => (mem.has(id) ? (mem.get(id) as T) : typeof initial === 'function' ? (initial as () => T)() : initial));
  const set = useCallback<Dispatch<SetStateAction<T>>>((x) => setV((prev) => {
    const next = typeof x === 'function' ? (x as (p: T) => T)(prev) : x;
    mem.set(id, next);
    return next;
  }), [id]);
  return [v, set];
}

/** Last scroll offset of a screen, read and written by Screen. */
export const scrollOf = (route: number) => (mem.get(`${route}:scroll`) as number | undefined) ?? 0;
export const saveScroll = (route: number, y: number) => { mem.set(`${route}:scroll`, y); };

useNav.subscribe((s) => {
  const live = new Set<string>(Object.values(s.stacks).flat().map((r) => String(r.key)));
  if (s.modal) live.add(String(s.modal.key));
  for (const id of mem.keys()) if (!live.has(id.slice(0, id.indexOf(':')))) mem.delete(id);
});
