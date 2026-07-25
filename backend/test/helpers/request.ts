import { env } from 'cloudflare:test';
import { app } from '../../src/index';

export { env };

export type Init = Parameters<typeof app.request>[1];

export const request = (path: string, init?: Init) =>
  app.request(path, init, env as unknown as Record<string, unknown>);

export const json = async <T = unknown>(res: Response): Promise<T> => {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`expected JSON, got ${res.status} ${text.slice(0, 200)}`);
  }
};

export const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

export const jsonHeaders = (token?: string) => ({
  'content-type': 'application/json',
  ...(token ? authHeader(token) : {}),
});
