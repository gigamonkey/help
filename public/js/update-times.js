/*
 * Tick the on-page clocks once a second: the elapsed .time stamps on
 * help cards and the .countdown of time left in the period. A countdown
 * element carries data-seconds-left from the server (relative, so
 * neither client clock skew nor DEBUG_TIME can garble it) and is
 * anchored to a wall-clock deadline the first time we see it; live.js
 * swaps deliver a fresh element with a fresh count.
 */

const hms = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
};

const updateTimes = () => {
  document.querySelectorAll('.time').forEach((e) => {
    e.innerText = hms(Math.round((Date.now() - e.dataset.time * 1000) / 1000));
  });
  document.querySelectorAll('.countdown').forEach((e) => {
    if (!e.dataset.deadline) {
      e.dataset.deadline = Date.now() + e.dataset.secondsLeft * 1000;
    }
    e.innerText = hms(Math.max(0, Math.round((e.dataset.deadline - Date.now()) / 1000)));
  });
};

updateTimes();
setInterval(updateTimes, 1000);
