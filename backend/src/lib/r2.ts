// R2 helpers. The Worker is wired to the bucket via the `MANTTIO_REPORTS` binding;
// public reads are served through the CDN at `${CDN_BASE_URL}/${key}`.

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

export const r2Key = (originalName: string) =>
  `reports/${Date.now()}-${safeName(originalName)}`;

export const cdnUrl = (cdnBase: string, key: string) => `${cdnBase}/${key}`;

export const keyFromCdnUrl = (cdnBase: string, url: string): string | null => {
  if (!url.startsWith(cdnBase)) return null;
  return url.slice(cdnBase.length).replace(/^\//, '');
};

export const putObject = async (
  bucket: R2Bucket,
  key: string,
  body: ArrayBuffer | ReadableStream | string,
  contentType?: string,
) => {
  await bucket.put(key, body, contentType ? { httpMetadata: { contentType } } : undefined);
  return key;
};

export const deleteObject = (bucket: R2Bucket, key: string) => bucket.delete(key);

export const deleteObjects = async (bucket: R2Bucket, keys: string[]) => {
  await Promise.all(keys.map((k) => bucket.delete(k)));
};

const BASE64_PREFIX = /^data:[^;]+;base64,/;

export const decodeBase64ToBytes = (input: string): Uint8Array => {
  const stripped = input.replace(BASE64_PREFIX, '');
  const binary = atob(stripped);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};
