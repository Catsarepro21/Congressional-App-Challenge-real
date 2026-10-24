/** Export saved records without credentials, session state, or attached file contents. */
export function privacyExport(savedState: unknown): string {
  const excluded = new Set(['geminiApiKey', 'accessToken', 'refreshToken', 'idToken', 'googleAccessToken', 'googleRefreshToken', 'googleOAuthClientId', 'healthConnections', 'photoUri', 'documentImage']);
  return JSON.stringify({format:'Healthfolio health export', version:1, exportedAt:new Date().toISOString(), records:savedState},
    (key, value) => excluded.has(key) || typeof value === 'function' ? undefined : value, 2);
}
