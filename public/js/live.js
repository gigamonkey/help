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
 *
 * The room page (/r/:room) additionally refreshes itself at the next bell:
 * the server puts the seconds until the schedule could change on #queue as
 * data-refresh-in, and every swap delivers the next deadline.
 */

const url = document.body.dataset.events;

let source = null;
let refreshing = false;
let refreshAgain = false;
let switchTimer = null;

/*
 * Re-fetch at the next bell, a little after the deadline so the server is
 * sure to be into the next interval. Clamped: never sooner than a few
 * seconds (no tight loops if the deadline is somehow in the past), never
 * later than six hours (weekend-long "next bell"s just re-check cheaply,
 * and stay well under setTimeout's 32-bit ceiling).
 */
const armSwitchTimer = () => {
  clearTimeout(switchTimer);
  const seconds = Number(document.querySelector('#queue')?.dataset.refreshIn);
  if (Number.isFinite(seconds) && seconds > 0) {
    const delay = Math.min(Math.max(seconds + 2, 5), 6 * 60 * 60);
    switchTimer = setTimeout(refresh, delay * 1000);
  }
};

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
        armSwitchTimer();
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
  armSwitchTimer();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      source?.close();
      source = null;
    } else {
      connect(true);
    }
  });
}
