const elapsed = (utcSeconds) => {
  const millis = Date.now() - utcSeconds * 1000;
  const seconds = Math.round(millis / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
};

const updateTimes = () => {
  document.querySelectorAll('.time').forEach((e) => {
    e.innerText = elapsed(e.dataset.time);
  });
};

const updatePage = () => {
  document.location.reload();
};


updateTimes();
setInterval(updateTimes, 1000);
setInterval(updatePage, 15 * 1000);
