import { google } from 'googleapis';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URL } from './config.ts';
import { randomString } from './crypto.ts';

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

/*
 * What Google's token endpoint sends back.
 */
export type TokenData = {
  access_token: string;
  expires_in: number;
  id_token: string;
  scope: string;
  token_type: string;
  refresh_token?: string;
};

const authParams = (state: string) =>
  new URLSearchParams({
    // FIXME: could possibly use nonce and hd as well
    state,
    client_id: GOOGLE_CLIENT_ID,
    response_type: 'code',
    scope: SCOPES.join(' '),
    redirect_uri: GOOGLE_REDIRECT_URL,
  });

const tokenParams = (code: string) =>
  new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URL,
    grant_type: 'authorization_code',
  });

const oauth = {
  newState: randomString,

  url: (state: string) => `${BASE_AUTH_URL}?${authParams(state)}`,

  getToken: (code: string): Promise<TokenData> =>
    fetch(TOKEN_URL, { method: 'POST', body: tokenParams(code) }).then(
      (r) => r.json() as Promise<TokenData>,
    ),

  oauth2client: () =>
    new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URL),
};

export default oauth;
