import { MEDIA } from './names';
import { int, next, pick } from './rng';
import type { League, Message, News } from './types';

export function pushNews(L: League, n: Omit<News, 'id' | 'date'> & { date?: string }) {
  const item: News = { id: L.nextMsgId++, date: n.date ?? L.date, ...n };
  L.news.unshift(item);
  if (L.news.length > 400) L.news.length = 400;
  return item;
}

export function pushMsg(L: League, m: Omit<Message, 'id' | 'date' | 'read'> & { date?: string }) {
  const msg: Message = { id: L.nextMsgId++, date: m.date ?? L.date, read: false, ...m };
  L.inbox.unshift(msg);
  if (L.inbox.length > 200) L.inbox.length = 200;
  return msg;
}

/** Fictional social-media reaction. */
export function social(L: League, text: string, opts: { kind?: string; team?: string; players?: number[] } = {}) {
  const pool = opts.kind ? MEDIA.filter((m) => m.kind === opts.kind) : MEDIA;
  const author = pick(pool.length ? pool : MEDIA);
  return pushNews(L, {
    kind: 'social',
    title: text,
    author: author.name,
    handle: author.handle,
    likes: int(40, 9000) * (next() < 0.1 ? 8 : 1),
    team: opts.team,
    players: opts.players,
  });
}

export function unreadCount(L: League) {
  return L.inbox.filter((m) => !m.read).length;
}
