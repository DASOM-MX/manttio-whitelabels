declare global {
  interface Window {
    turnstile?: {
      reset: (containerId?: string) => void;
      remove: (containerId: string) => void;
      render: (container: string | HTMLElement, options: TurnstileOptions) => string;
      getResponse: (containerId?: string) => string | undefined;
    };
  }
}

export interface TurnstileOptions {
  sitekey: string;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact';
  callback?: (token: string) => void;
}
