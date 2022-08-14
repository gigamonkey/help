import 'dotenv/config';
import { randomString } from './crypto.js';
import { google } from 'googleapis';

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URL } = process.env;

const BASE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.profile.emails',
  'https://www.googleapis.com/auth/classroom.profile.photos',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
];

const authParams = (state) =>
  new URLSearchParams({
    // FIXME: could possibly use nonce and hd as well
    state,
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: SCOPES.join(' '),
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

  oauth2client: () => new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL),
};

export default oauth;
