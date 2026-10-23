import * as Crypto from 'expo-crypto';

export const GOOGLE_IOS_CLIENT_ID = '178801571593-jjv6fmn8te3q9rjt4am5p3slk4m7d4vr.apps.googleusercontent.com';
export const GOOGLE_IOS_SCHEME = 'com.googleusercontent.apps.178801571593-jjv6fmn8te3q9rjt4am5p3slk4m7d4vr';

export async function createGooglePKCE() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const verifier = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {encoding: Crypto.CryptoEncoding.BASE64});
  return {verifier, challenge: digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), state: Crypto.randomUUID()};
}

export function googleRedirectUri(clientId: string): string {
  if (clientId !== GOOGLE_IOS_CLIENT_ID) throw new Error('This Google client is not configured for this iOS build.');
  return `${GOOGLE_IOS_SCHEME}:/oauthredirect`;
}

export function validateGoogleCallback(url: string, redirect: string, state: string): string {
  // Custom schemes are not parsed consistently by React Native's URL implementation.
  const separator = url.indexOf('?');
  const params = new URLSearchParams(separator === -1 ? '' : url.slice(separator + 1));
  if (separator === -1 || url.slice(0, separator) !== redirect || url.includes('#') || params.getAll('state').length !== 1 || params.get('state') !== state) {
    throw new Error('Google sign-in response did not match this request. Please try again.');
  }
  const error = params.get('error');
  if (error) throw new Error(`Google sign-in rejected: ${error}`);
  const code = params.get('code');
  if (!code || params.getAll('code').length !== 1) throw new Error('Google did not return one authorization code.');
  return code;
}
