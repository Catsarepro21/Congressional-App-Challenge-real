import {controlledRequest} from './RequestControl';

/** Narrow exception to offline mode: OAuth tokens and read-only Google Health imports only. */
export const googleHealthFetch: typeof fetch = async (input, options = {}) => {
  if (typeof input !== 'string') throw new Error('Google Health requires an explicit URL.');
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid Google Health URL.');
  const method = (options.method || 'GET').toUpperCase();
  const healthPath = /^\/v4\/users\/me\/(identity|dataTypes\/(steps|active-energy-burned|heart-rate|daily-resting-heart-rate|sleep|height|weight)\/dataPoints:reconcile)$/;
  const tokenRequest = url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token' && !url.search && method === 'POST';
  const healthRead = url.origin === 'https://health.googleapis.com' && healthPath.test(url.pathname) && method === 'GET';
  const profileRead = url.origin === 'https://people.googleapis.com' && url.pathname === '/v1/people/me' && method === 'GET';
  if (!tokenRequest && !healthRead && !profileRead) throw new Error('This request is outside Google Health read-only access.');
  if (tokenRequest) {
    if (typeof options.body !== 'string') throw new Error('Invalid OAuth token request.');
    const form = new URLSearchParams(options.body);
    const allowed = new Set(['code','client_id','redirect_uri','grant_type','code_verifier','refresh_token']);
    if ([...form.keys()].some(key => !allowed.has(key)) || !['authorization_code','refresh_token'].includes(form.get('grant_type') || '')) throw new Error('Invalid OAuth token fields.');
  } else {
    if (options.body != null) throw new Error('Health record uploads are not supported.');
    const allowed = new Set(profileRead ? ['personFields'] : ['filter','pageSize','pageToken','dataSourceFamily']);
    if ([...url.searchParams.keys()].some(key => !allowed.has(key))) throw new Error('Invalid Google Health query.');
  }
  return controlledRequest(signal => globalThis.fetch(url.toString(), {
    ...options, method, signal, redirect:'error', credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer',
  }), 20000, options.signal ?? undefined);
};
