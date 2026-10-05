// One career on a phone, a tablet and a PC: the room code, joining by code and the choice when both devices played on.
import { useState } from 'react';
import { useGame } from '../../store/game';
import { createRoom, joinRoom, leaveRoom, pullIfNewer, resolveConflict, useCloud } from '../../store/cloud';
import { CODE_LEN, CloudError, parseCode, roomLink, showCode } from '../../persistence/cloud';
import { Button, Card, SectionTitle, Spinner } from './kit';
import { Dialog, Sheet } from './shell';
import { dateLong } from '../format';

const ago = (t?: number) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн. назад`;
};

/** Settings: put the career into a room, show its code, sync now, leave. */
export function RoomSettings() {
  const saveId = useGame((s) => s.saveId);
  const toast = useGame((s) => s.toast);
  const { busy, error } = useCloud();
  useCloud((s) => s.ver);
  const link = saveId ? roomLink(saveId) : null;
  const share = async (code: string) => {
    const text = `Код комнаты Football GM: ${showCode(code)}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(showCode(code)); toast('Код скопирован', 'good'); }
    } catch { /* cancelled */ }
  };
  return (
    <>
      <SectionTitle>Игра на нескольких устройствах</SectionTitle>
      {link ? (
        <Card>
          <div className="text-[12.5px] text-muted">Код комнаты</div>
          <div className="num text-[30px] tracking-[0.12em] leading-tight select-all">{showCode(link.code)}</div>
          <div className="text-[12.5px] text-muted mt-1">
            {busy ? 'Синхронизация…' : error ? <span className="text-bad">{error}</span> : link.dirty ? 'Есть несохранённые в облаке изменения' : `Синхронизировано ${ago(link.synced)}`}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <Button full onClick={() => share(link.code)}>Поделиться кодом</Button>
            <Button full disabled={busy} onClick={() => pullIfNewer()}>{busy ? <Spinner /> : 'Синхронизировать'}</Button>
          </div>
          <Button full variant="ghost" className="mt-1" onClick={() => leaveRoom()}>Отключить это устройство</Button>
        </Card>
      ) : (
        <Button full disabled={busy} onClick={async () => {
          try { await createRoom(); toast('Комната создана: введите код на другом устройстве', 'good'); } catch (e) { toast(e instanceof CloudError ? e.message : 'Не удалось создать комнату', 'bad'); }
        }}>{busy ? <Spinner /> : 'Создать код комнаты'}</Button>
      )}
      <div className="text-[12px] text-muted mt-2 px-1">
        Карьера хранится в облаке под кодом. Введите его на телефоне, планшете или компьютере («Играть по коду» в главном меню) — и продолжайте с того же дня.
        Изменения уходят в облако сами через несколько секунд и при сворачивании игры; при возвращении подтягивается то, что сыграно на другом устройстве.
        Код — как ключ: кто его знает, тот может играть этой карьерой.
      </div>
    </>
  );
}

/** Main menu: open a career by its room code. */
export function JoinRoomSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useGame((s) => s.toast);
  const busy = useCloud((s) => s.busy);
  const [text, setText] = useState('');
  const code = parseCode(text);
  const go = async () => {
    if (!code) return;
    try {
      const L = await joinRoom(code);
      onClose();
      toast(`Карьера открыта: ${L.gm.name}, ${dateLong(L.date)}`, 'good');
    } catch (e) {
      toast(e instanceof CloudError ? e.message : 'Не удалось открыть карьеру', 'bad');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Играть по коду комнаты">
      <div className="text-[13.5px] text-muted mb-3">Код показан на другом устройстве: «Ещё» → «Настройки» → «Игра на нескольких устройствах».</div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
        placeholder="XXX-XXX-XXX"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={CODE_LEN + 4}
        className="w-full h-14 rounded-2xl glass px-4 mb-3 outline-none text-center num text-[24px] tracking-[0.12em] uppercase placeholder:text-faint"
      />
      <Button variant="primary" size="lg" full disabled={!code || busy} onClick={go}>{busy ? <Spinner /> : 'Открыть карьеру'}</Button>
    </Sheet>
  );
}

/** Both this device and another one played on since the last sync: the user picks which career stays. */
export function ConflictDialog() {
  const conflict = useCloud((s) => s.conflict);
  const busy = useCloud((s) => s.busy);
  const L = useGame((s) => s.L);
  if (!conflict || !L) return null;
  return (
    <Dialog open onClose={() => {}}>
      <div className="font-display uppercase text-[20px] tracking-wide">Две версии карьеры</div>
      <div className="text-[14px] text-muted mt-2">На другом устройстве игра ушла вперёд, пока здесь тоже играли. Какую версию оставить? Вторая будет заменена.</div>
      <div className="flex flex-col gap-2 mt-4">
        <Button variant="primary" full disabled={busy} onClick={() => resolveConflict('remote')}>С другого устройства · {dateLong(conflict.remote.date)}</Button>
        <Button full disabled={busy} onClick={() => resolveConflict('local')}>На этом устройстве · {dateLong(L.date)}</Button>
      </div>
    </Dialog>
  );
}
