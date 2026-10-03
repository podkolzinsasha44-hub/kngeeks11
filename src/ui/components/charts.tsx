import { motion } from 'motion/react';
import type { ReactNode } from 'react';

export function Sparkline({ values, width = 120, height = 36, color = 'var(--accent)', labels }: { values: number[]; width?: number; height?: number; color?: string; labels?: string[] }) {
  if (values.length < 2) return <div className="text-muted text-[12px]">недостаточно данных</div>;
  const min = Math.min(...values) - 2, max = Math.max(...values) + 2;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 8) + 4, height - 4 - ((v - min) / (max - min)) * (height - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height + (labels ? 14 : 0)} className="overflow-visible">
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="2.8" fill={color} />
          <text x={p[0]} y={p[1] - 6} textAnchor="middle" fontSize="9.5" fill="#cfd8e6" className="num">{values[i]}</text>
          {labels && <text x={p[0]} y={height + 12} textAnchor="middle" fontSize="9" fill="#7c889e">{labels[i]}</text>}
        </g>
      ))}
    </svg>
  );
}

/** xG momentum per five minutes: bars above the line are the home side's. */
export function Momentum({ bins, home, away }: { bins: number[]; home: string; away: string }) {
  const max = Math.max(0.25, ...bins.map(Math.abs));
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted mb-1"><span>{home} ▲</span><span>▼ {away}</span></div>
      <div className="flex items-center gap-1 h-24 relative">
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10" />
        {bins.map((b, i) => (
          <div key={i} className="flex-1 h-full relative">
            <motion.div
              className="absolute left-0 right-0 rounded-sm"
              style={{ background: b >= 0 ? 'var(--accent)' : '#8b98ae', top: b >= 0 ? `${50 - (b / max) * 50}%` : '50%' }}
              initial={{ height: 0 }}
              animate={{ height: `${(Math.abs(b) / max) * 50}%` }}
              transition={{ delay: i * 0.03 }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-faint mt-1"><span>1'</span><span>45'</span><span>90'</span></div>
    </div>
  );
}

/** Football pitch background; children are drawn in a 105×68 coordinate system. */
export function PitchSvg({ children, className, vertical }: { children?: ReactNode; className?: string; vertical?: boolean }) {
  const lines = (
    <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.35">
      <rect x="0.5" y="0.5" width="104" height="67" />
      <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" />
      <circle cx="52.5" cy="34" r="9.15" />
      <rect x="0.5" y="13.85" width="16.5" height="40.3" />
      <rect x="88" y="13.85" width="16.5" height="40.3" />
      <rect x="0.5" y="24.85" width="5.5" height="18.3" />
      <rect x="99" y="24.85" width="5.5" height="18.3" />
      <path d="M17 26.7a9.15 9.15 0 010 14.6M88 26.7a9.15 9.15 0 000 14.6" />
      <circle cx="11" cy="34" r="0.4" fill="#fff" /><circle cx="94" cy="34" r="0.4" fill="#fff" /><circle cx="52.5" cy="34" r="0.4" fill="#fff" />
    </g>
  );
  const stripes = Array.from({ length: 10 }, (_, i) => <rect key={i} x={i * 10.5} y="0" width="10.5" height="68" fill={i % 2 ? '#1c7a41' : '#1f8748'} />);
  return (
    <svg viewBox={vertical ? '0 0 68 105' : '0 0 105 68'} className={className} style={{ borderRadius: 18, display: 'block' }}>
      <g transform={vertical ? 'translate(68 0) rotate(90)' : undefined}>
        {stripes}
        {lines}
      </g>
      {children}
    </svg>
  );
}

/** Shot map: the home side attacks to the right, the away side to the left. Circle size follows xG. */
export function ShotMap({ shots, home, colors }: { shots: { team: string; x: number; y: number; goal: boolean; xg: number }[]; home: string; colors: [string, string] }) {
  return (
    <PitchSvg className="w-full">
      {shots.map((s, i) => {
        const isH = s.team === home;
        const x = (isH ? s.x : 1 - s.x) * 105, y = (isH ? s.y : 1 - s.y) * 68;
        const r = 0.9 + Math.sqrt(s.xg) * 3.2;
        return s.goal
          ? <circle key={i} cx={x} cy={y} r={r + 0.5} fill={isH ? colors[0] : colors[1]} stroke="#fff" strokeWidth="0.6" />
          : <circle key={i} cx={x} cy={y} r={r} fill="none" stroke={isH ? colors[0] : colors[1]} strokeWidth="0.5" opacity="0.9" />;
      })}
    </PitchSvg>
  );
}

export function Ring({ value, size = 64, stroke = 7, color = 'var(--accent)', label }: { value: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="num text-[17px]">{value >= 0.995 ? '99' : value < 0.005 && value > 0 ? '<1' : Math.round(value * 100)}<span className="text-[10px]">%</span></span>
        {label && <span className="text-[9px] text-muted mt-0.5 uppercase tracking-wider">{label}</span>}
      </div>
    </div>
  );
}
