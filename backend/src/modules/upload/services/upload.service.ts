import { cdnUrl, putObject, r2Key } from '../../storage/services/storage.service';

// Thrown when the uploaded file's content-type isn't an image; the controller
// maps it to 415 not_an_image (the message carries the offending content-type).
export class NotAnImageError extends Error {
  constructor(public readonly contentType: string) {
    super(`content-type ${contentType} is not an image`);
  }
}

export const uploadImage = async (
  bucket: R2Bucket,
  cdnBase: string,
  file: File,
): Promise<{ url: string; key: string }> => {
  if (!file.type.startsWith('image/')) {
    throw new NotAnImageError(file.type);
  }
  const key = r2Key(file.name || 'upload.bin');
  const body = await file.arrayBuffer();
  await putObject(bucket, key, body, file.type);
  return { url: cdnUrl(cdnBase, key), key };
};
