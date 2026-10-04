import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useGame, useL } from '../../store/game';
import { useNav } from '../../store/nav';
import { LEAGUES, foreignLimit, isLeague, windowOpen } from '../../engine/leagues';
import { lineupValid, teamPower } from '../../engine/lineup';
import { gameOdds, seasonOdds } from '../../engine/projection';
import { nextUserGame, teamGames } from '../../engine/season';
import { placeOf } from '../../engine/standings';
import { unreadCount } from '../../engine/news';
import { wageBill } from '../../engine/contracts';
import { foreignOnPitch } from '../../engine/ai';
import { resultOf } from '../../store/game';
import { Button, Card, cx, Meter, SectionTitle, Chevron, Pill } from '../components/kit';
import { Screen, Icon } from '../components/shell';
import { TeamBadge } from '../components/media';
import { Ring } from '../components/charts';
import { dateLong, dateShort, dowRu, money, phaseLabel, recordStr, seasonLabel } from '../format';
import { SimDock } from './SimOverlay';

export function Office() {
  const L = useL();
  const push = useNav((s) => s.push);
  const go = useNav((s) => s.go);
  const openModal = useNav((s) => s.openModal);
  const t = L.teams[L.user];
  const ng = nextUserGame(L);
  const lim = foreignLimit(t.lg, L.season);
  const xiKey = t.lineup.xi.join(',') + t.lineup.form + t.tactic;
  const opp = ng ? L.teams[ng.h === L.user ? ng.a : ng.h] : null;
  // The odds come from the match engine itself, played with the two elevens as they stand now.
  const odds = useMemo(() => (ng ? gameOdds(L, ng.h, ng.a, ng.comp, 400) : null), [ng?.id, xiKey, opp?.lineup.xi.join(','), L.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const so = useMemo(() => (L.comps[t.lg].phase !== 'done' ? seasonOdds(L, t.lg, 250)[t.id] : null), [L.date, xiKey, t.lg]); // eslint-disable-line react-hooks/exhaustive-deps
  const home = ng?.h === L.user;
  const unread = unreadCount(L);
  const recent = teamGames(L, L.user).filter((g) => g.played).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 5);
  const valid = lineupValid(L, t) && (!lim || foreignOnPitch(L, t) <= lim[1]);
  const cfg = LEAGUES[t.lg];
  const place = placeOf(L, t.id);
  const simulate = useGame((s) => s.simulate);
  return (
    <Screen
      title="Офис"
      subtitle={`${L.gm.name} · ${dateLong(L.date)}`}
      right={
        <button onClick={() => push('inbox')} className="press relative w-11 h-11 flex items-center justify-center rounded-full glass" aria-label="Входящие">
          <Icon name="mail" size={21} />
          {!!unread && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-[11px] font-semibold flex items-center justify-center">{unread}</span>}
        </button>
      }
    >
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 pt-1 pb-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 blur-2xl opacity-60 rounded-full" style={{ background: t.primary }} />
          <span className="relative block"><TeamBadge team={t} size={72} /></span>
        </div>
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[0.16em] text-muted truncate">{phaseLabel(L)} · {seasonLabel(L.season)}</div>
          <div className="font-display uppercase text-[26px] leading-none mt-1 truncate">{t.ru}</div>
          <div className="text-[14px] text-muted mt-1.5">
            {t.rec.gp ? <><span className="num text-ink text-[16px]">{recordStr(t)}</span> · {t.rec.pts} оч. · {place}-е место, {cfg.short}</> : <>Сезон ещё не начался · {cfg.short}</>}
          </div>
          <div className="text-[12.5px] text-faint mt-0.5">{dowRu(L.date)}, {dateLong(L.date)} · сила старта <span className="num text-ink/80">{teamPower(L, t).toFixed(0)}</span></div>
        </div>
      </motion.div>

      {!valid && (
        <Card className="mb-3 border-bad/40" onClick={() => go('roster', undefined, { tab: 'lineup' })}>
          <div className="flex items-center gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1 text-[14px]"><b>Состав на матч неполный.</b> Игрок из старта травмирован, дисквалифицирован или превышен лимит на легионеров. Нажмите, чтобы поправить.</div>
            <Chevron />
          </div>
        </Card>
      )}

      {ng && opp && odds && (
        <div className="relative rounded-[28px] overflow-hidden p-[1px]" style={{ background: 'linear-gradient(135deg, var(--accent), rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.03))' }}>
          <div className="relative rounded-[27px] p-4 overflow-hidden" style={{ background: `linear-gradient(120deg, color-mix(in oklab, var(--team) 55%, #070b14), #070b14 55%, color-mix(in oklab, ${opp.primary} 40%, #070b14))` }}>
            <div className="flex items-center justify-between gap-2 text-[11.5px] uppercase tracking-[0.14em] text-white/70">
              <span className="truncate">{isLeague(ng.comp) ? `Следующий матч · ${ng.rd}-й тур` : `${ng.comp === 'CUP' ? 'Кубок России' : 'Переходные матчи'}${ng.rd ? ` · ${ng.rd}` : ''}`}</span>
              <span className="shrink-0">{dowRu(ng.day)}, {dateShort(ng.day)}</span>
            </div>
            <div className="flex items-center justify-between mt-3">
              <Side id={ng.h} />
              <div className="flex flex-col items-center min-w-0">
                <div className="font-display text-[13px] text-white/60 uppercase tracking-widest">{home ? 'дома' : 'в гостях'}</div>
                <div className="num text-[34px] leading-none mt-1">{Math.round((home ? odds.h : odds.a) * 100)}%</div>
                <div className="text-[11px] text-white/60 mt-0.5">шанс победы</div>
                <div className="text-[11px] text-white/50 mt-1 whitespace-nowrap tnum">ничья {Math.round(odds.d * 100)}% · xG {odds.xgH.toFixed(1)}:{odds.xgA.toFixed(1)}</div>
              </div>
              <Side id={ng.a} />
            </div>
            <div className="text-[11.5px] text-white/55 mt-3 leading-snug text-center">Шансы — {400} прогонов матчевого движка с вашими одиннадцатью и составом соперника.</div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" full onClick={() => simulate('game', undefined, { watch: true })} icon={<Icon name="eye" size={16} />}>Смотреть матч</Button>
              <Button size="sm" full onClick={() => go('roster', undefined, { tab: 'lineup' })} icon={<Icon name="roster" size={16} />}>Расстановка{t.lineup.auto ? ' · авто' : ''}</Button>
            </div>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="flex gap-2 mt-3">
          {recent.reverse().map((g) => {
            const r = resultOf(L, g);
            return (
              <button key={g.id} onClick={() => openModal('match', { id: g.id })} className="press flex-1 glass rounded-xl py-1.5 text-center">
                <div className={cx('text-[11px] font-semibold', r === 'W' ? 'text-good' : r === 'L' ? 'text-bad' : 'text-muted')}>{r === 'W' ? 'В' : r === 'L' ? 'П' : 'Н'}</div>
                <div className="num text-[14px] leading-tight">{g.hs}:{g.as}</div>
                <div className="text-[10px] text-faint">{L.teams[g.h === L.user ? g.a : g.h].short}</div>
              </button>
            );
          })}
        </div>
      )}

      {so && (
        <>
          <SectionTitle>Прогноз сезона</SectionTitle>
          <Card className="flex items-center justify-around">
            <Ring value={so.title} label={cfg.up ? '1-е место' : 'титул'} color="#e8c26a" />
            <Ring value={so.top} label={cfg.up ? 'выход' : `топ-${cfg.top}`} />
            {(cfg.relegate > 0 || cfg.playoff > 0) && <Ring value={so.down} label="зона вылета" color="#ff5a5f" />}
            <div className="text-center">
              <div className="num text-[24px] leading-none">{so.pts.toFixed(0)}</div>
              <div className="text-[9px] text-muted uppercase tracking-wider mt-1">очков · ~{so.place.toFixed(0)}-е</div>
            </div>
          </Card>
        </>
      )}

      <SectionTitle>Руководство</SectionTitle>
      <Card>
        <div className="flex justify-between text-[13px] mb-1.5"><span className="text-muted">Доверие совета директоров</span><span className="num">{L.owner.trust}/100</span></div>
        <Meter value={L.owner.trust} color={L.owner.trust < 30 ? '#ff5a5f' : L.owner.trust < 55 ? '#ffb547' : '#3ddc97'} />
        <div className="text-[13.5px] mt-3"><span className="text-muted">Задача на сезон:</span> {L.owner.goalText}.</div>
      </Card>

      <SectionTitle>Финансы</SectionTitle>
      <Card onClick={() => go('more', 'finance')}>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-[14px]"><span className="text-muted">Бюджет на трансферы</span><span className="num text-[16px]">{money(t.budget)}</span></div>
            <div className="flex justify-between text-[14px] mt-1"><span className="text-muted">Зарплаты</span><span className="num text-[16px]">{money(wageBill(L, t.id))} / {money(t.wageBudget)}</span></div>
          </div>
          <Chevron />
        </div>
        <div className="mt-2 flex gap-1.5 flex-wrap">
          <Pill color={windowOpen(L) ? '#3ddc97' : '#8b98ae'}>{windowOpen(L) ? 'Трансферное окно открыто' : 'Окно закрыто'}</Pill>
          {lim && <Pill>Легионеры: до {lim[0]} в заявке, {lim[1]} на поле</Pill>}
        </div>
      </Card>

      {L.inbox.filter((m) => !m.read).slice(0, 3).length > 0 && (
        <>
          <SectionTitle right={<button className="text-[13px] accent-text" onClick={() => push('inbox')}>Все</button>}>Входящие</SectionTitle>
          <Card pad={false}>
            {L.inbox.filter((m) => !m.read).slice(0, 3).map((m) => (
              <div key={m.id} onClick={() => push('inbox', { open: m.id })} className="press px-4 py-3 border-b border-white/5 last:border-0">
                <div className="text-[12px] text-muted">{m.from} · {dateShort(m.date)}</div>
                <div className="text-[14.5px] font-medium truncate">{m.title}</div>
              </div>
            ))}
          </Card>
        </>
      )}
      <SimDock />
    </Screen>
  );
}

function Side({ id }: { id: string }) {
  const L = useL();
  const push = useNav((s) => s.push);
  const t = L.teams[id];
  return (
    <button onClick={() => push('team', { id })} className="press flex flex-col items-center w-24 min-w-0">
      <TeamBadge team={t} size={58} />
      <div className="font-display uppercase text-[14px] mt-1.5 truncate max-w-full">{t.ru}</div>
      <div className="text-[11.5px] text-white/60 tnum">{t.rec.gp ? recordStr(t) : `сила ${teamPower(L, t).toFixed(0)}`}</div>
    </button>
  );
}
