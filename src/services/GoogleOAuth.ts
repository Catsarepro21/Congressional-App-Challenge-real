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
  const returned = new URL(url);
  const expected = new URL(redirect);
  if (returned.protocol !== expected.protocol || returned.host !== expected.host || returned.pathname !== expected.pathname || returned.searchParams.get('state') !== state) {
    throw new Error('Google sign-in response did not match this request. Please try again.');
  }
  const error = returned.searchParams.get('error');
  if (error) throw new Error(`Google sign-in rejected: ${error}`);
  const code = returned.searchParams.get('code');
  if (!code) throw new Error('Google did not return an authorization code.');
  return code;
}
