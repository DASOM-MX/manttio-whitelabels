import { cdnUrl, putObject, r2Key } from '../../storage/services/storage.service';
import { NotAnImageError } from '../http-errors/not-an-image.error';

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
