/*
 * Live queue updates: subscribe to the class's SSE stream (the URL is in
 * the body's data-events attribute) and refresh whenever the queue
 * changes. Events are notify-only, so a refresh re-fetches the current
 * page and swaps in its #queue element — never a full reload, which would
 * eat a half-typed question on the up-next page.
 *
 * Hidden tabs disconnect (an open stream holds the fly machine awake);
 * any (re)connection after a gap refreshes once, so missed events —
 * hidden tab, deploy, suspend/resume — can't leave a stale page.
 */

const url = document.body.dataset.events;

let source = null;
let refreshing = false;
let refreshAgain = false;

const refresh = async () => {
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  try {
    const res = await fetch(document.location.href);
    if (res.ok) {
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const fresh = doc.querySelector('#queue');
      const current = document.querySelector('#queue');
      if (fresh && current) {
        current.replaceWith(fresh);
      }
    }
  } finally {
    refreshing = false;
    if (refreshAgain) {
      refreshAgain = false;
      refresh();
    }
  }
};

const connect = (stale) => {
  source = new EventSource(url);
  source.addEventListener('queue', refresh);
  // EventSource reconnects by itself; an error marks a gap we may have
  // missed events in, and the open that ends the gap refreshes once.
  source.addEventListener('error', () => {
    stale = true;
  });
  source.addEventListener('open', () => {
    if (stale) {
      stale = false;
      refresh();
    }
  });
};

if (url) {
  connect(false);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      source?.close();
      source = null;
    } else {
      connect(true);
    }
  });
}
