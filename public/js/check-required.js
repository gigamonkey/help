const required = document.querySelectorAll('.required');

const check = () => {
  document.querySelector('#submit').disabled = ![...required].every((e) => e.value);
};

required.forEach((e) => {
  e.oninput = check;
});

check();
