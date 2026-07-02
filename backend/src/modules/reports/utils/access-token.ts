// High-entropy access token used as the bearer in `/reports/download/{token}` URLs (§9).
// 32 bytes → 43 chars base64url; URL-safe; the URL itself is the secret.

export const generateAccessToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};
