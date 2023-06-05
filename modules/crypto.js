/* eslint-disable new-cap */

import crypto from 'crypto';
import CryptoJS from 'crypto-js';

/* eslint-disable no-bitwise */

/*
 * Make a random string.
 */
const randomString = () => {
  const array = new Uint32Array(4);
  crypto.getRandomValues(array);
  return [...array]
    .map((n) => n.toString(16).padStart(8, 0))
    .join('-')
    .toLowerCase();
};

/*
 * Make a short random string.
 */
const shortRandomString = () => {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0].toString(36);
};

/*
 * Encrypt some data (converted to JSON) using a strong symmetric-key algorithm
 * and the given secret.
 */
const encrypt = (data, secret) => CryptoJS.AES.encrypt(JSON.stringify(data), secret).toString();

/*
 * Decrypt some ciphertext using a strong symmetric-key algorithm and the given
 * secret and parse as JSON.
 */
const decrypt = (ciphertext, secret) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};

/*
 * Get a time-based one-time password with a given time to live and a given
 * number of digits.
 */
const totp = (secret, ttlSeconds, digits) => hotp(secret, counter(ttlSeconds)) % 10 ** digits;

const counter = (ttlSeconds) => Math.floor(Date.now() / (ttlSeconds * 1000));

const hotp = (secret, counter) => truncate(hmac(counter.toString(10), secret));

const hmac = (text, secret) => CryptoJS.HmacSHA1(text, secret);

const truncate = (mac) => extract31(mac, mac.words[mac.words.length - 1] & 0xf);

const extract31 = (mac, index) => {
  let v = 0;
  for (let i = 0; i < 4; i++) {
    v = (v << 8) | extractByte(mac, index + i, i === 0 ? 0x7f : 0xff);
  }
  return v;
};

const extractByte = (mac, i, mask) => {
  const w = Math.floor(i / 4);
  const b = i % 4;
  const bits = mac.words[w] & 0xffffffff;
  return (bits >>> (8 * (3 - b))) & mask;
};

// Show the 32 bits of a number in twos-complement form since toString(2)
// doesn't work right for negative numbers as it just shows the binary form of
// the positive number with a negative sign in front of it.
const b32 = (n) => {
  if (n & 0x80000000) {
    return `1${(n & 0x7fffffff).toString(2).padStart(31, '0')}`;
  } else {
    return (n & 0xffffffff).toString(2).padStart(32, '0');
  }
};

export { randomString, shortRandomString, encrypt, decrypt, totp, b32 };
