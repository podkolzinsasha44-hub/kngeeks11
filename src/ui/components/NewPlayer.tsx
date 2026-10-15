import { useRef, useState } from 'react';
import { createPlayer } from '../../engine/gen';
import type { Player, Role } from '../../engine/types';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { ROLE_RU } from '../format';
import { Button, cx, Segmented } from './kit';
import { Sheet } from './shell';

const ROLES: Role[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const field = 'w-full h-12 rounded-2xl glass px-4 text-[16px] outline-none placeholder:text-faint';
const label = 'text-[12px] uppercase tracking-wider text-muted';

/** The photo from the phone, cut to a head-and-shoulders portrait like the Transfermarkt ones and kept small. */
async function portrait(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight;
    // The face of a phone photo is usually in the upper middle: keep 80% of the width, 0.77 wide by tall.
    const cw = Math.min(W, Math.round(W * 0.8)), ch = Math.min(H, Math.round(cw / 0.77));
    const sx = Math.round((W - cw) / 2), sy = Math.max(0, Math.min(H - ch, Math.round(0.38 * H - 0.42 * ch)));
    const c = document.createElement('canvas');
    c.width = 300; c.height = Math.round(300 / 0.77);
    c.getContext('2d')!.drawImage(img, sx, sy, cw, ch, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "Создать игрока": a player of the user's own making, for his club only. */
export function NewPlayerSheet({ onClose }: { onClose: () => void }) {
  const L = useL();
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const push = useNav((s) => s.push);
  const [fn, setFn] = useState('');
  const [ln, setLn] = useState('');
  const [role, setRole] = useState<Role>('LW');
  const [foot, setFoot] = useState<Player['foot']>('L');
  const [year, setYear] = useState(String(L.season - 16));
  const [ovr, setOvr] = useState(92);
  const [pot, setPot] = useState(99);
  const [past, setPast] = useState<{ club: string; years: number }[]>([{ club: '', years: 2 }]);
  const [photo, setPhoto] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    try { setPhoto(await portrait(f)); } catch { toast('Не удалось открыть фото', 'bad'); }
  };
  const save = () => {
    let res: Player | string = 'Ошибка';
    act(() => { res = createPlayer(L, { fn, ln, role, foot, year: Number(year) || L.season - 16, ovr, pot: Math.max(pot, ovr), past, photo }); });
    if (typeof res === 'string') return toast(res, 'bad');
    const p: Player = res;
    toast(`${p.ru} в составе: рейтинг ${p.ovr}, потенциал ${p.pot}`, 'good');
    onClose();
    push('player', { id: p.id });
  };

  return (
    <Sheet open onClose={onClose} title="Новый игрок" full>
      <div className="flex flex-col gap-2.5">
        <div className="text-[12.5px] text-muted leading-snug">Свой игрок для вашего клуба: например, парень из вашей академии. Он есть только в вашей карьере на этом устройстве (и в вашей комнате, если играете на нескольких), в саму игру не попадает.</div>
        <div className="flex items-center gap-3">
          <button onClick={() => file.current?.click()} className="press shrink-0 w-[84px] h-[109px] rounded-2xl glass overflow-hidden flex items-center justify-center text-[12px] text-muted text-center leading-tight" aria-label="Фото игрока">
            {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <span>📷<br />Фото</span>}
          </button>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          <div className="flex-1 flex flex-col gap-2">
            <input value={fn} onChange={(e) => setFn(e.target.value)} placeholder="Имя" autoComplete="off" className={field} />
            <input value={ln} onChange={(e) => setLn(e.target.value)} placeholder="Фамилия" autoComplete="off" className={field} />
          </div>
        </div>

        <div className={cx(label, 'mt-2')}>Позиция</div>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button key={r} onClick={() => setRole(r)} className={cx('press h-11 min-w-[52px] px-3 rounded-full text-[14px] font-medium border', role === r ? 'bg-white text-[#05070d] border-white' : 'glass')}>{ROLE_RU[r]}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2 items-end">
          <label className={label}>Год рождения<input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className={cx(field, 'mt-1 normal-case tracking-normal text-ink')} /></label>
          <div><div className={cx(label, 'mb-1')}>Нога</div><Segmented<Player['foot']> value={foot} onChange={setFoot} options={[{ v: 'L', label: 'Левая' }, { v: 'R', label: 'Правая' }, { v: 'B', label: 'Обе' }]} /></div>
        </div>

        <div className="flex items-center justify-between mt-2"><span className={label}>Рейтинг</span><span className="num text-[22px]">{ovr}</span></div>
        <input type="range" min={40} max={99} value={ovr} onChange={(e) => { const v = Number(e.target.value); setOvr(v); if (pot < v) setPot(v); }} className="w-full h-11 accent-[var(--accent)]" aria-label="Рейтинг" />
        <div className="flex items-center justify-between"><span className={label}>Потенциал</span><span className="num text-[22px]">{Math.max(pot, ovr)}</span></div>
        <input type="range" min={40} max={99} value={Math.max(pot, ovr)} onChange={(e) => setPot(Math.max(ovr, Number(e.target.value)))} className="w-full h-11 accent-[var(--accent)]" aria-label="Потенциал" />
        <div className="text-[12px] text-muted -mt-1">Ориентир: 90+ — мировой класс (Мбаппе, Ямаль), 80 — звезда РПЛ, 65 — крепкий игрок Второй лиги.</div>

        <div className={cx(label, 'mt-2')}>Прошлые клубы (сначала самый ранний)</div>
        {past.map((x, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input value={x.club} onChange={(e) => setPast(past.map((y, k) => (k === i ? { ...y, club: e.target.value } : y)))} placeholder="Клуб или академия" autoComplete="off" className={cx(field, 'flex-1 min-w-0')} />
            <input value={x.years || ''} onChange={(e) => setPast(past.map((y, k) => (k === i ? { ...y, years: Math.min(10, Number(e.target.value.replace(/\D/g, '')) || 0) } : y)))} inputMode="numeric" placeholder="лет" aria-label="Сколько лет" className={cx(field, '!w-[72px] text-center')} />
            {past.length > 1 && <button onClick={() => setPast(past.filter((_, k) => k !== i))} className="press hit w-9 h-9 text-muted" aria-label="Убрать клуб">✕</button>}
          </div>
        ))}
        {past.length < 5 && <Button variant="ghost" size="sm" onClick={() => setPast([...past, { club: '', years: 2 }])}>+ ещё клуб</Button>}

        <Button variant="primary" size="lg" full className="mt-3" disabled={!ln.trim()} onClick={save}>Добавить в состав</Button>
      </div>
    </Sheet>
  );
}
