import type { Response } from 'express';

/*
 * Live queue notifications over Server-Sent Events. Single-process fan-out:
 * every write goes through this process, so a per-class set of subscribed
 * responses sees every change. Events are notify-only — they carry no data;
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

export const broadcast = (class_id: string): void => {
  for (const res of subscribers.get(class_id) ?? []) {
    res.write('event: queue\ndata:\n\n');
  }
};
