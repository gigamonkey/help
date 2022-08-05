import cryptoJS from 'crypto-js';

const encrypt = (data, secret) => cryptoJS.AES.encrypt(JSON.stringify(data), secret).toString();

const decrypt = (ciphertext, secret) => {
  const bytes = cryptoJS.AES.decrypt(ciphertext, secret);
  return JSON.parse(bytes.toString(cryptoJS.enc.Utf8));
};

export { encrypt, decrypt };
