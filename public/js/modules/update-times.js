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

const patch = (url, data) => {
  return fetch(url, {
    method: 'PATCH',
    body: JSON.stringify(data),
    headers: {
      'Content-type': 'application/json; charset=UTF-8',
    },
  });
};

document.querySelectorAll('.action-button').forEach((e) => {
  e.onclick = async () => {
    const { id, classId, action } = e.dataset;
    await patch(`/api/${classId}/help/${id}/${action}`, {}).then(() => {
      //window.location = window.location;
      console.log("Done");
    }).catch((err) => console.log(err));
  }
});

updateTimes();
setInterval(updateTimes, 1000);
