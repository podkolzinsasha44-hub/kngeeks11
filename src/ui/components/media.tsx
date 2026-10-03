import type { ReactNode } from 'react';
import { useGame } from '../../store/game';
import { useNav } from '../../store/nav';
import type { League, Player, Team } from '../../engine/types';
import { clubLabel, dispName, fitColor, flag, playerAge, ROLE_RU } from '../format';
import { cx, Ovr } from './kit';

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export const inkOn = (hex: string) => (lum(hex) > 0.6 ? '#0b1220' : '#ffffff');

/** Club badge drawn from the club colours and its short code (no real logos are used). */
export function TeamBadge({ team, id, size = 36 }: { team?: Team; id?: string; size?: number }) {
  const t = team ?? (id ? useGame.getState().L?.teams[id] : undefined);
  const a = t?.primary ?? '#334', b = t?.secondary ?? '#889';
  const uid = `b${(t?.id ?? 'x').replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
      <defs>
        <clipPath id={uid}><path d="M20 2l15 5v12c0 9-6.5 15.5-15 19C11.5 34.5 5 28 5 19V7z" /></clipPath>
      </defs>
      <g clipPath={`url(#${uid})`}>
        <rect width="40" height="40" fill={a} />
        <path d="M-4 30L30 -4h10L6 40z" fill={b} opacity="0.92" />
        <rect width="40" height="40" fill="url(#gloss)" />
      </g>
      <path d="M20 2l15 5v12c0 9-6.5 15.5-15 19C11.5 34.5 5 28 5 19V7z" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <text x="20" y="23.5" textAnchor="middle" fontSize="10.5" fontFamily="Oswald Variable, Oswald, sans-serif" fontWeight="700" fill="#fff" stroke="rgba(0,0,0,0.55)" strokeWidth="2.2" paintOrder="stroke">{t?.short ?? ''}</text>
    </svg>
  );
}

/** Small shirt in club colours with the squad number. */
export function Kit({ primary, secondary, num, size = 40 }: { primary: string; secondary: string; num?: number | null; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
      <path d="M13 5l-9 5 3 8 4-2v19h18V16l4 2 3-8-9-5c-1 3-3.5 4.5-7 4.500S14 8 13 5z" fill={primary} stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" />
      <path d="M4 10l3 8 4-2v-5zM36 10l-3 8-4-2v-5z" fill={secondary} opacity="0.9" />
      <path d="M13 5c1 3 3.5 4.5 7 4.500S26 8 27 5" fill="none" stroke={secondary} strokeWidth="1.6" />
      {num != null && <text x="20" y="27" textAnchor="middle" fontSize="13" fontFamily="Oswald Variable, Oswald, sans-serif" fontWeight="700" fill={inkOn(primary)}>{num}</text>}
    </svg>
  );
}

export function PlayerKit({ L, p, size = 40 }: { L: League; p: Player; size?: number }) {
  const t = p.team ? L.teams[p.team] : null;
  return <Kit primary={t?.primary ?? '#3a4458'} secondary={t?.secondary ?? '#8b98ae'} num={p.team ? p.num : null} size={size} />;
}

export function StatusDots({ p }: { p: Player }) {
  return (
    <>
      {p.inj && <span title="Травма" className="text-bad text-[12px]">✚{p.inj.days}</span>}
      {!!p.susp && <span title="Дисквалификация" className="text-[12px]">🟥</span>}
      {p.wantsOut && <span title="Хочет уйти" className="text-warn text-[12px]">↗</span>}
      {p.listed && <span title="Выставлен на трансфер" className="text-[11px] text-ice">ТР</span>}
      {p.loan && <span title="Аренда" className="text-[11px] text-muted">АР</span>}
    </>
  );
}

export function PlayerRow({ p, right, sub, onClick, showClub, dense }: { p: Player; right?: ReactNode; sub?: ReactNode; onClick?: () => void; showClub?: boolean; dense?: boolean }) {
  const L = useGame.getState().L!;
  const push = useNav((s) => s.push);
  return (
    <div onClick={onClick ?? (() => push('player', { id: p.id }))} className={cx('press flex items-center gap-3 px-3 active:bg-white/5', dense ? 'min-h-[52px] py-1.5' : 'min-h-[62px] py-2')}>
      <PlayerKit L={L} p={p} size={dense ? 34 : 40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-medium text-[15.500px]">{dispName(p)}</span>
          <StatusDots p={p} />
        </div>
        <div className="text-[12.500px] text-muted truncate">
          {sub ?? (
            <>
              <span className="text-ink/80">{ROLE_RU[p.role]}</span> · {playerAge(L, p)} · {flag(p.ctry)}
              {showClub && <> · {clubLabel(L, p)}</>}
              {!showClub && p.team && <> · <span style={{ color: fitColor(p.fit) }}>{Math.round(p.fit)}%</span></>}
            </>
          )}
        </div>
      </div>
      {right}
      <Ovr v={p.ovr} size={dense ? 32 : 36} />
    </div>
  );
}

/** Three-way chance bar: home win, draw, away win. */
export function OddsBar({ h, d, a, labels }: { h: number; d: number; a: number; labels?: [string, string] }) {
  const p = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-white/8">
        <div style={{ width: p(h), background: 'var(--accent)' }} />
        <div style={{ width: p(d), background: 'rgba(255,255,255,0.28)' }} />
        <div style={{ width: p(a), background: '#8b98ae' }} />
      </div>
      <div className="flex justify-between text-[12px] mt-1.5 tnum">
        <span><span className="num text-[15px] accent-text">{p(h)}</span> <span className="text-muted">{labels?.[0] ?? 'победа'}</span></span>
        <span className="text-muted">ничья <span className="num text-[15px] text-ink">{p(d)}</span></span>
        <span><span className="text-muted">{labels?.[1] ?? 'поражение'}</span> <span className="num text-[15px]">{p(a)}</span></span>
      </div>
    </div>
  );
}
