// Heavy reports on screen (match odds, transfer and sale advice) and the simulation. While days are simulated the
// visible screen re-renders after each of them; recomputing these reports every time made the simulation several
// times slower than the days themselves and heated phones. useCalm keeps the last value while the simulation runs
// and recomputes everything once it stops.
import { useRef } from 'react';
import { useGame } from '../store/game';

const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/**
 * useMemo that holds still during a simulation. `deps` are honoured only when no simulation runs; a change of `live`
 * deps recomputes at once, with `quick` set while the simulation runs (fewer engine runs), and a value computed
 * during the simulation is recomputed in full when it stops.
 */
export function useCalm<T>(fn: (quick: boolean) => T, deps: readonly unknown[], live: readonly unknown[] = []): T {
  const running = useGame((s) => !!s.sim?.running);
  const ref = useRef<{ v: T; deps: readonly unknown[]; live: readonly unknown[]; quick: boolean } | null>(null);
  const c = ref.current;
  if (!c || !same(c.live, live) || (!running && (c.quick || !same(c.deps, deps)))) ref.current = { v: fn(running), deps, live, quick: running };
  return ref.current!.v;
}
