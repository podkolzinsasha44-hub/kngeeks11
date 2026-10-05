// Squad editor of a youth team: the user types in the real players of his sports-school team.
// Everything stays in the save on this device.
import { useState } from 'react';
import { useGame, useL } from '../../store/game';
import { squad } from '../../engine/lineup';
import type { Player, Role } from '../../engine/types';
import { addYouthPlayer, editYouthPlayer, isYouth, removeYouthPlayer, renameYouthTeam } from '../../engine/youth';
import { Button, Card, cx, Empty, SectionTitle } from '../components/kit';
import { Screen, Sheet } from '../components/shell';
import { PlayerRow, TeamBadge } from '../components/media';
import { ROLE_FULL, ROLE_RU } from '../format';

const ROLES: Role[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];
const ORDER = { G: 0, D: 1, M: 2, F: 3 };
const field = 'w-full h-12 rounded-2xl glass px-4 text-[16px] outline-none placeholder:text-faint';

export function YouthScreen({ params }: { params: Record<string, unknown> }) {
  const L = useL();
  const act = useGame((s) => s.act);
  const toast = useGame((s) => s.toast);
  const t = L.teams[String(params.id)];
  const [edit, setEdit] = useState<number | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  if (!t || !isYouth(t)) return <Screen title="Состав"><Empty title="Это не юношеская команда" /></Screen>;
  const sq = squad(L, t.id).sort((a, b) => ORDER[a.pos] - ORDER[b.pos] || (a.num ?? 99) - (b.num ?? 99));
  const add = () => { const id = act(() => addYouthPlayer(L, t.id)); if (id) setEdit(id); };
  return (
    <Screen title="Состав команды" subtitle={t.ru}>
      <Card className="mt-1 flex items-center gap-3">
        <TeamBadge team={t} size={44} />
        <div className="flex-1 min-w-0">
          <div className="font-display uppercase text-[18px] truncate">{t.ru}</div>
          <div className="text-[12.5px] text-muted truncate">{t.stadium}</div>
        </div>
        <Button size="sm" onClick={() => setRename(t.ru)}>Название</Button>
      </Card>
      <div className="text-[12.5px] text-muted mt-2.5 px-1 leading-snug">
        Сначала в команде игроки-заготовки. Нажмите на игрока, чтобы вписать настоящее имя, позицию, номер, год рождения и силу. Всё хранится только в сохранении на этом устройстве.
      </div>
      {(['G', 'D', 'M', 'F'] as const).map((pos) => {
        const list = sq.filter((p) => p.pos === pos);
        if (!list.length) return null;
        return (
          <div key={pos}>
            <SectionTitle>{{ G: 'Вратари', D: 'Защитники', M: 'Полузащитники', F: 'Нападающие' }[pos]} · {list.length}</SectionTitle>
            <Card pad={false} className="overflow-hidden">
              {list.map((p) => <PlayerRow key={p.id} dense p={p} onClick={() => setEdit(p.id)} sub={<>{ROLE_RU[p.role]} · {p.bd.slice(0, 4)} г. р.{p.num ? ` · №${p.num}` : ''}</>} right={<span className="text-[13px] accent-text mr-1">Изменить</span>} />)}
            </Card>
          </div>
        );
      })}
      <div className="h-3" />
      <Button variant="primary" size="lg" full onClick={add}>Добавить игрока</Button>
      {edit != null && L.players[edit] && (
        <EditSheet key={edit} p={L.players[edit]} onClose={() => setEdit(null)}
          onSave={(e) => { act(() => editYouthPlayer(L, edit, e)); setEdit(null); toast('Игрок сохранён', 'good'); }}
          onRemove={() => { act(() => removeYouthPlayer(L, edit)); setEdit(null); toast('Игрок удалён из состава'); }} />
      )}
      <Sheet open={rename != null} onClose={() => setRename(null)} title="Название команды">
        <input value={rename ?? ''} onChange={(e) => setRename(e.target.value)} maxLength={40} className={field} />
        <Button variant="primary" size="lg" full className="mt-4" onClick={() => { act(() => renameYouthTeam(L, t.id, rename ?? '')); setRename(null); }}>Сохранить</Button>
      </Sheet>
    </Screen>
  );
}

function EditSheet({ p, onClose, onSave, onRemove }: { p: Player; onClose: () => void; onSave: (e: Parameters<typeof editYouthPlayer>[2]) => void; onRemove: () => void }) {
  const [fn, setFn] = useState(p.fn);
  const [ln, setLn] = useState(p.ln);
  const [role, setRole] = useState<Role>(p.role);
  const [num, setNum] = useState(p.num ? String(p.num) : '');
  const [year, setYear] = useState(p.bd.slice(0, 4));
  const [ovr, setOvr] = useState(p.ovr);
  const [sure, setSure] = useState(false);
  return (
    <Sheet open onClose={onClose} title="Игрок">
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2">
          <input value={fn} onChange={(e) => setFn(e.target.value)} placeholder="Имя" autoComplete="off" className={field} />
          <input value={ln} onChange={(e) => setLn(e.target.value)} placeholder="Фамилия" autoComplete="off" className={field} />
        </div>
        <div className="text-[12px] uppercase tracking-wider text-muted mt-2">Позиция · {ROLE_FULL[role]}</div>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button key={r} onClick={() => setRole(r)} className={cx('press h-11 min-w-[52px] px-3 rounded-full text-[14px] font-medium border', role === r ? 'bg-white text-[#05070d] border-white' : 'glass')}>{ROLE_RU[r]}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <label className="text-[12px] uppercase tracking-wider text-muted">Номер<input value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="—" className={cx(field, 'mt-1 normal-case tracking-normal text-ink')} /></label>
          <label className="text-[12px] uppercase tracking-wider text-muted">Год рождения<input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className={cx(field, 'mt-1 normal-case tracking-normal text-ink')} /></label>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[12px] uppercase tracking-wider text-muted">Сила</span>
          <span className="num text-[22px]">{ovr}</span>
        </div>
        <input type="range" min={30} max={75} value={ovr} onChange={(e) => setOvr(Number(e.target.value))} className="w-full h-11 accent-[var(--accent)]" aria-label="Сила игрока" />
        <div className="text-[12px] text-muted -mt-1">Ориентир: 45 — обычный игрок команды, 55 — лидер, 65 — уровень взрослой Второй лиги. При смене позиции характеристики подстраиваются под новую роль.</div>
        <Button variant="primary" size="lg" full className="mt-3" onClick={() => onSave({ fn, ln, role, num: num ? Number(num) : null, year: Number(year) || undefined, ovr })}>Сохранить</Button>
        {sure
          ? <Button variant="danger" full onClick={onRemove}>Да, удалить из состава</Button>
          : <Button variant="ghost" full onClick={() => setSure(true)}>Удалить игрока</Button>}
      </div>
    </Sheet>
  );
}
