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

const authParams = (state) =>
  new URLSearchParams({
    // FIXME: could possibly use nonce and hd as well
    state,
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: REDIRECT_URL,
  });

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

  url: (state) => `${BASE_AUTH_URL}?${authParams(state)}`,

  getToken: (code) =>
    fetch(TOKEN_URL, { method: 'POST', body: tokenParams(code) }).then((r) => r.json()),
};

export default oauth;
