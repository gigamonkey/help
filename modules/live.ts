import type { Response } from 'express';
import db from './db.ts';

/*
 * Live queue notifications over Server-Sent Events. Single-process fan-out:
 * every write goes through this process, so a per-channel set of subscribed
 * responses sees every change. Channels are class ids (the class's queue
 * pages) and room:<room> strings (the per-room queue page, which follows
 * whatever class is in session). Events are notify-only — they carry no data;
 * clients react by re-fetching a page they can already see, so the stream
 * exposes nothing the pages don't.
 */

const subscribers = new Map<string, Set<Response>>();

/*
 * Comment lines keep intermediaries (the fly proxy) from idling out a quiet
 * stream. unref'd so an open subscription never holds the process alive.
 */
const HEARTBEAT_MILLIS = 25 * 1000;

setInterval(() => {
  for (const subs of subscribers.values()) {
    for (const res of subs) {
      res.write(': ping\n\n');
    }
  }
}, HEARTBEAT_MILLIS).unref();

export const subscribe = (class_id: string, res: Response): void => {
  let subs = subscribers.get(class_id);
  if (subs === undefined) {
    subs = new Set();
    subscribers.set(class_id, subs);
  }
  subs.add(res);
  // 'close' fires when the client disconnects for any reason.
  res.on('close', () => {
    subs.delete(res);
    if (subs.size === 0) {
      subscribers.delete(class_id);
    }
  });

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
};

export const broadcast = (channel: string): void => {
  for (const res of subscribers.get(channel) ?? []) {
    res.write('event: queue\ndata:\n\n');
  }
};

/*
 * The channel a room's queue page subscribes to. Normalized to match the
 * case-insensitive room lookup, so a class stored in "G210" reaches a
 * page opened as /r/g210.
 */
export const roomChannel = (room: string): string => `room:${room.trim().toLowerCase()}`;

/*
 * Notify every subscriber on every channel — for changes that can affect
 * any page, like the owner moving the simulated bell-schedule clock.
 */
export const broadcastAll = (): void => {
  for (const channel of subscribers.keys()) {
    broadcast(channel);
  }
};

/*
 * Notify everything showing this class's queue: the class's own channel
 * and, when the class has a room, the room channel its projector page
 * subscribes to. (A change in a class not currently in session costs the
 * room page one harmless extra refresh.)
 */
export const broadcastQueueChange = (class_id: string): void => {
  broadcast(class_id);
  const room = db.classRoom({ class_id });
  if (room) {
    broadcast(roomChannel(room));
  }
};
