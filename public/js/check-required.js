import { $, $$ } from '/js/modules/common.js';

const checkReady = () => {
  $('#submit').disabled = ![...$$('.required')].every((e) => e.value);
};

$$('.required').forEach((e) => (e.oninput = checkReady));

checkReady();
