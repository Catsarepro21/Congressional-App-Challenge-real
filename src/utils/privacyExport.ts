/** Export saved records without credentials, session state, or attached file contents. */
export function privacyExport(savedState: unknown): string {
  const excluded = new Set(['geminiApiKey', 'accessToken', 'refreshToken', 'idToken', 'googleOAuthClientId', 'healthConnections']);
  return JSON.stringify({format:'SafeScale health export', version:1, exportedAt:new Date().toISOString(), records:savedState},
    (key, value) => excluded.has(key) || typeof value === 'function' ? undefined : value, 2);
}
