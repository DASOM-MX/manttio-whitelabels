// Public output types for the generic Turnstile transport
// (turnstile.service.ts).
export type TurnstileVerifyResult = {
  success: boolean;
  errorCodes: string[];
};

// Wire shape of Cloudflare's siteverify response (subset we consume).
export type SiteverifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};
