import type { Player, Role, Team } from '../../engine/types';
import { fitColor, flag, ROLE_RU, tierOf } from '../format';
import { cx } from './kit';
import { Kit } from './media';

const SHAPE = 'polygon(14% 0, 86% 0, 100% 9%, 100% 83%, 50% 100%, 0 83%, 0 9%)';
const TIERS = {
  bronze: { bg: 'linear-gradient(160deg,#e2b388 0%,#a9744a 52%,#6f4725 100%)', ink: '#2a1708', edge: '#f1cfae' },
  silver: { bg: 'linear-gradient(160deg,#f6f8fb 0%,#bcc5d1 52%,#828d9c 100%)', ink: '#18202c', edge: '#ffffff' },
  gold: { bg: 'linear-gradient(160deg,#fff3bd 0%,#e8c26a 50%,#a9812a 100%)', ink: '#2a1e05', edge: '#fff7d6' },
  elite: { bg: 'linear-gradient(160deg,#4a4026 0%,#17140d 55%,#050505 100%)', ink: '#f6dc8c', edge: '#e8c26a' },
  legend: { bg: 'linear-gradient(160deg,#ffd0f4 0%,#a9dcff 40%,#b9ffd6 72%,#fff0b0 100%)', ink: '#1b1033', edge: '#ffffff' },
};

export const surname = (p: Player) => (p.ru ?? p.ln).split(' ').slice(-1)[0];

/**
 * Collectible-style player card: rating, position, country, club shirt with the number, surname.
 * `rating` and `role` let the pitch show how the player rates in the slot he is standing in.
 */
export function PlayerCard({ p, team, width, rating, role, selected, unavailable, warn, onClick }: {
  p: Player; team: Team | null; width: number; rating?: number; role?: Role; selected?: boolean; unavailable?: boolean; warn?: boolean; onClick?: () => void;
}) {
  const v = rating ?? p.ovr;
  const t = TIERS[tierOf(p.ovr)];
  const h = Math.round(width * 1.4);
  return (
    <button
      onClick={onClick}
      className={cx('press relative block shrink-0 transition-transform duration-150', selected && '-translate-y-1 scale-[1.08] z-10')}
      style={{ width, height: h, filter: selected ? 'drop-shadow(0 0 7px #fff) drop-shadow(0 6px 10px rgba(0,0,0,.6))' : 'drop-shadow(0 4px 6px rgba(0,0,0,.55))' }}
      aria-label={`${surname(p)}, ${ROLE_RU[role ?? p.role]}, рейтинг ${v}`}
    >
      <span className="absolute inset-0" style={{ clipPath: SHAPE, background: t.edge }} />
      <span className={cx('absolute', unavailable && 'grayscale')} style={{ inset: 1.5, clipPath: SHAPE, background: t.bg }} />
      <span className="absolute inset-0 opacity-40 pointer-events-none" style={{ clipPath: SHAPE, background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,.75) 48%, transparent 60%)' }} />
      <span className="absolute flex flex-col items-center leading-none" style={{ left: '9%', top: '9%', color: t.ink, width: '34%' }}>
        <span className="num font-bold" style={{ fontSize: width * 0.29, color: warn ? '#b3261e' : t.ink }}>{v}</span>
        <span className="font-display font-semibold" style={{ fontSize: width * 0.145, marginTop: width * 0.02 }}>{ROLE_RU[role ?? p.role]}</span>
        <span className="font-semibold" style={{ fontSize: width * 0.125, marginTop: width * 0.03, opacity: 0.85 }}>{flag(p.ctry)}</span>
      </span>
      <span className="absolute" style={{ right: '7%', top: '10%' }}>
        <Kit primary={p.pos === 'G' ? '#f2c230' : team?.primary ?? '#3a4458'} secondary={p.pos === 'G' ? '#1b1b1b' : team?.secondary ?? '#aab4c8'} num={p.num} size={width * 0.5} />
      </span>
      <span className="absolute inset-x-0 text-center font-display uppercase font-semibold truncate" style={{ top: '60%', color: t.ink, fontSize: width * 0.155, padding: `0 ${width * 0.09}px`, letterSpacing: '0.01em' }}>
        {surname(p)}
      </span>
      <span className="absolute left-1/2 -translate-x-1/2 rounded-full overflow-hidden" style={{ top: '78%', width: '40%', height: 3, background: 'rgba(0,0,0,.28)' }}>
        <span className="block h-full" style={{ width: `${p.fit}%`, background: fitColor(p.fit) }} />
      </span>
      {(p.inj || !!p.susp) && (
        <span className="absolute rounded-full bg-bad text-white font-bold flex items-center justify-center" style={{ right: -2, top: -4, width: width * 0.3, height: width * 0.3, fontSize: width * 0.17 }}>
          {p.inj ? '✚' : '!'}
        </span>
      )}
    </button>
  );
}

/** Empty place on the pitch or on the bench. */
export function EmptyCard({ width, label, onClick }: { width: number; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="press relative block shrink-0" style={{ width, height: Math.round(width * 1.4) }}>
      <span className="absolute inset-0 border-2 border-dashed border-white/40 bg-black/25" style={{ clipPath: SHAPE }} />
      <span className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
        <span style={{ fontSize: width * 0.36, lineHeight: 1 }}>+</span>
        <span className="font-display" style={{ fontSize: width * 0.15 }}>{label}</span>
      </span>
    </button>
  );
}
