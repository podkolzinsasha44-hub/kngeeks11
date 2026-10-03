import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useGame } from '../../store/game';
import { deleteSave, importFile, lastSaveId, listSaves, type SaveMeta } from '../../persistence/db';
import { LEAGUES, LEAGUE_IDS } from '../../engine/leagues';
import type { Difficulty, LeagueId } from '../../engine/types';
import type { WorldTeam } from '../../engine/world';
import { Button, Card, Chips, cx, Segmented, Spinner } from '../components/kit';
import { Icon, Sheet } from '../components/shell';
import { Kit } from '../components/media';
import { dateLong, money, seasonLabel } from '../format';

export function Menu() {
  const { open, loading, toast, setLeague, loadWorld } = useGame();
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [mode, setMode] = useState<'menu' | 'new'>('menu');
  const [showSaves, setShowSaves] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => listSaves().then(setSaves).catch(() => setSaves([]));
  useEffect(() => { refresh(); loadWorld().catch(() => toast('Не удалось загрузить базу игроков', 'bad')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const last = saves.find((s) => s.id === lastSaveId()) ?? saves[0];
  if (mode === 'new') return <NewCareer onBack={() => setMode('menu')} />;
  return (
    <div className="absolute inset-0 flex flex-col px-5 pt-safe pb-safe z-10">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }} className="text-[72px] leading-none">⚽</motion.div>
        <motion.h1 initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="font-display uppercase text-[46px] leading-[1.1] tracking-wide mt-4 text-gradient-ice">Football GM</motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="text-muted mt-3 max-w-[320px] text-[15px]">
          Сезон 2026/27. Реальные клубы и игроки РПЛ, Первой лиги и пяти топ-лиг Европы. Соберите команду — и на поле выйдет именно она.
        </motion.p>
      </div>
      <div className="flex flex-col gap-2.5 max-w-[460px] w-full mx-auto pb-6">
        {loading && <div className="flex justify-center py-2"><Spinner /></div>}
        {last && (
          <Button variant="primary" size="lg" full onClick={() => open(last.id)} icon={<Icon name="play" size={18} />}>
            <span className="truncate">Продолжить · {last.name}</span>
          </Button>
        )}
        <Button variant={last ? 'glass' : 'primary'} size="lg" full onClick={() => setMode('new')}>Новая карьера</Button>
        <div className="flex gap-2.5">
          <Button full onClick={() => setShowSaves(true)} disabled={!saves.length}>Сохранения</Button>
          <Button full onClick={() => file.current?.click()}>Импорт файла</Button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { await loadWorld(); setLeague(await importFile(f)); } catch { toast('Не удалось прочитать файл сохранения', 'bad'); }
        }} />
        <p className="text-[11.5px] text-faint text-center mt-2 leading-snug">
          Фан-проект, не связан с РПЛ, РФС, FIFA, UEFA и клубами. Некоммерческий. Составы — сентябрь 2026 (Википедия), оценки игроков — открытые данные; зарплаты — модель.
        </p>
      </div>
      <Sheet open={showSaves} onClose={() => setShowSaves(false)} title="Сохранения">
        <div className="flex flex-col gap-2">
          {saves.map((s) => (
            <div key={s.id} className="glass rounded-2xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0" onClick={() => { setShowSaves(false); open(s.id); }}>
                <div className="font-medium truncate">{s.name}</div>
                <div className="text-[12.5px] text-muted">{seasonLabel(s.season)} · {dateLong(s.date)}</div>
              </div>
              <Button size="sm" variant="danger" onClick={async () => { await deleteSave(s.id); refresh(); }}>Удалить</Button>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function NewCareer({ onBack }: { onBack: () => void }) {
  const { world, start, loading } = useGame();
  const [lg, setLg] = useState<LeagueId>('RPL');
  const [team, setTeam] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [diff, setDiff] = useState<Difficulty>('real');
  const [noFiring, setNoFiring] = useState(false);
  const [intlRussia, setIntlRussia] = useState(false);
  const info = useMemo(() => {
    const m = new Map<string, { power: number; n: number; value: number }>();
    if (!world) return m;
    const by = new Map<string, number[]>();
    const val = new Map<string, number>();
    for (const p of world.players) {
      if (!p.t) continue;
      (by.get(p.t) ?? by.set(p.t, []).get(p.t)!).push(p.o);
      val.set(p.t, (val.get(p.t) ?? 0) + p.v);
    }
    for (const [t, arr] of by) {
      const top = arr.sort((a, b) => b - a).slice(0, 11);
      m.set(t, { power: top.reduce((a, b) => a + b, 0) / top.length, n: arr.length, value: val.get(t) ?? 0 });
    }
    return m;
  }, [world]);
  if (!world) return <div className="absolute inset-0 flex items-center justify-center z-10"><Spinner size={28} /></div>;
  const teams = world.teams.filter((t) => t.lg === lg).sort((a, b) => (info.get(b.id)?.power ?? 0) - (info.get(a.id)?.power ?? 0));
  const sel: WorldTeam | undefined = teams.find((t) => t.id === team);
  return (
    <div className="absolute inset-0 flex flex-col z-10">
      <header className="pt-safe px-2 shrink-0">
        <div className="flex items-center h-12">
          <button onClick={onBack} className="press w-11 h-11 flex items-center justify-center" aria-label="Назад"><Icon name="back" /></button>
          <div className="font-display uppercase tracking-wide text-[18px]">Новая карьера</div>
        </div>
      </header>
      <div className="scroll flex-1 px-4">
        <div className="text-muted text-[14px] mb-3">Выберите лигу и клуб. Вы — спортивный директор: состав, трансферы, контракты и расстановка на матч — ваши решения.</div>
        <Chips value={lg} onChange={(v) => { setLg(v); setTeam(null); }} options={LEAGUE_IDS.map((id) => ({ v: id, label: LEAGUES[id].short }))} />
        <div className="flex flex-col gap-2 mt-3">
          {teams.map((t, i) => {
            const inf = info.get(t.id);
            const active = t.id === team;
            return (
              <button key={t.id} onClick={() => setTeam(t.id)} className={cx('press glass rounded-2xl p-3 flex items-center gap-3 text-left border', active ? 'border-white/60' : 'border-transparent')} style={active ? { background: `linear-gradient(135deg, color-mix(in oklab, ${t.primary} 45%, transparent), rgba(255,255,255,0.03))` } : undefined}>
                <Kit primary={t.primary} secondary={t.secondary} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="font-display uppercase tracking-wide text-[17px] truncate">{t.ru}</div>
                  <div className="text-[12.5px] text-muted truncate">сила состава {inf ? inf.power.toFixed(0) : '—'} · {inf?.n ?? 0} игроков · бюджет {money(t.budget)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="num text-[13px] text-muted">#{i + 1}</div>
                  <div className="text-[11px] text-faint">в лиге</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="h-64" />
      </div>
      {sel && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute inset-x-0 bottom-0 glass-strong rounded-t-[28px] px-4 pt-4 pb-safe border-b-0">
          <div className="max-w-[520px] mx-auto pb-4">
            <div className="font-display uppercase text-[20px] tracking-wide">{sel.ru}</div>
            <div className="text-[12.5px] text-muted mb-3">{LEAGUES[lg].name} · тренер {sel.coach.name} · стадион {sel.stadium}</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя" maxLength={28} className="w-full h-11 rounded-2xl glass px-4 mb-2.5 outline-none placeholder:text-faint" />
            <Segmented value={diff} onChange={setDiff} options={[{ v: 'rookie', label: 'Новичок' }, { v: 'real', label: 'Реализм' }, { v: 'hard', label: 'Хардкор' }]} />
            <div className="text-[11.5px] text-muted mt-1.5 mb-2.5 px-1">Сложность меняет жадность клубов и агентов и терпение руководства. На шансы в матчах она не влияет никогда.</div>
            <div className="flex gap-2 mb-3">
              <Toggle on={noFiring} set={setNoFiring} label="Без увольнения" />
              <Toggle on={intlRussia} set={setIntlRussia} label="Россия на ЧМ и Евро" />
            </div>
            <Button variant="primary" size="lg" full disabled={loading} onClick={() => start({ team: sel.id, gmName: name.trim() || 'Спортивный директор', settings: { difficulty: diff, noFiring, intlRussia } })}>
              {loading ? <Spinner /> : `Возглавить «${sel.ru}»`}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => set(!on)} className={cx('press flex-1 h-10 rounded-xl text-[13px] font-medium border', on ? 'bg-white text-[#05070d] border-white' : 'glass text-ink/80')}>
      {on ? '✓ ' : ''}{label}
    </button>
  );
}

export { Card };
