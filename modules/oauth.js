import 'dotenv/config';
import crypto from 'crypto';

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URL } = process.env;

const BASE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const randomString = () => {
  const array = new Uint32Array(4);
  crypto.getRandomValues(array);
  return [...array]
    .map((n) => n.toString(16).padStart(8, 0))
    .join('-')
    .toLowerCase();
};

const AUTH_PARAMS = {
  // FIXME: could possibly use nonce and hd as well
  client_id: CLIENT_ID,
  response_type: 'code',
  scope: 'openid email',
  redirect_uri: REDIRECT_URL,
};

const formurlencoded = (data) =>
  Object.entries(data)
    .map((kv) => kv.map(encodeURIComponent).join('='))
    .join('&');

const tokenParams = (code) =>
  new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URL,
    grant_type: 'authorization_code',
  });

const oauth = {
  newSessionID: randomString,

  newState: randomString,

  url: (state) => `${BASE_AUTH_URL}?${formurlencoded({ ...AUTH_PARAMS, state })}`,

  getToken: (code) =>
    fetch(TOKEN_URL, { method: 'POST', body: tokenParams(code) }).then((r) => r.json()),
};

export default oauth;
