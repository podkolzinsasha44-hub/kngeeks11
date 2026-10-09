import { useMemo } from 'react';
import { absences, dateRu } from '../../engine/medical';
import type { League } from '../../engine/types';
import { useGame } from '../../store/game';
import { useNav } from '../../store/nav';
import { Card, Meter, SectionTitle } from './kit';
import { PlayerPhoto } from './media';
import { dispName } from '../format';

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};
export const matchesRu = (n: number) => `${n} ${plural(n, 'матч', 'матча', 'матчей')}`;

/** The club's injured and suspended players: when they are back, what they miss and who covers for them. */
export function MedicalCard({ L }: { L: League }) {
  const push = useNav((s) => s.push);
  const t = L.teams[L.user];
  const ver = useGame((s) => s.ver);
  const list = useMemo(() => absences(L, L.user), [L, ver]);
  if (!list.length) return null;
  const xi = new Set(t.lineup.xi);
  return (
    <>
      <SectionTitle right={<span className="text-[12px] text-muted">{list.length} {plural(list.length, 'игрок', 'игрока', 'игроков')}</span>}>Лазарет</SectionTitle>
      <Card pad={false} className="overflow-hidden">
        {list.slice(0, 6).map((a) => (
          <div key={a.p.id} onClick={() => push('player', { id: a.p.id })} className="press flex items-center gap-3 px-3 py-2.5 border-b border-white/5 last:border-0">
            <PlayerPhoto L={L} p={a.p} size={40} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[14.5px]">
                <span className="truncate font-medium">{dispName(a.p)}</span>
                <span className="shrink-0 text-[12px]">{a.kind === 'inj' ? '✚' : '🟥'}</span>
              </div>
              <div className="text-[12px] text-muted truncate">
                {a.kind === 'inj' ? a.p.inj!.type : 'дисквалификация'}
                {' · '}{a.misses ? `пропустит ${matchesRu(a.misses)}` : 'матчей не пропустит'}
                {a.cover ? ` · играет ${dispName(a.cover)}` : xi.has(a.p.id) ? ' · стоит в старте!' : ''}
              </div>
              {a.kind === 'inj' && <Meter value={a.progress * 100} height={4} className="mt-1.5" color={a.progress > 0.7 ? '#3ddc97' : a.progress > 0.35 ? '#ffb547' : '#ff5a5f'} />}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-muted">{a.kind === 'inj' ? 'вернётся' : 'сыграет'}</div>
              <div className="num text-[14px]">{a.back ? dateRu(a.back) : '—'}</div>
            </div>
          </div>
        ))}
      </Card>
      {list.some((a) => a.cover) && <div className="text-[11.5px] text-muted mt-1.5 px-1">Когда игрок поправится или отбудет дисквалификацию, штаб сам вернёт его на место в стартовом составе.</div>}
    </>
  );
}
