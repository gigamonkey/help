/*
 * The help-request form: the Submit button is disabled until every
 * .required field is filled in, and while the request is over the length
 * limit the server will accept (data-maxlength on the textarea, from
 * HELP_MAX_CHARS). Over the limit we show the server's message too, so a
 * student who pastes in a novel learns why before the round trip.
 */

const required = document.querySelectorAll('.required');
const problem = document.querySelector('#problem');
const count = document.querySelector('#char-count');
const tooLong = document.querySelector('#too-long');
const submit = document.querySelector('#submit');

const max = Number(problem.dataset.maxlength);

const check = () => {
  const over = problem.value.length > max;
  const filled = [...required].every((e) => e.value);
  submit.disabled = over || !filled;
  count.textContent = `${problem.value.length} / ${max}`;
  count.classList.toggle('over', over);
  tooLong.hidden = !over;
};

required.forEach((e) => {
  e.oninput = check;
});

check();
