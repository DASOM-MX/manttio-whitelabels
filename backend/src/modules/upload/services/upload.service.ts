import { cdnUrl, putObject, r2Key } from '../../storage/services/storage.service';
import { isContractFileMime } from '../../contracts/constants/contract-file-types';
import { NotAnImageError } from '../http-errors/not-an-image.error';
import { UnsupportedContractFileError } from '../http-errors/unsupported-contract-file.error';

export const uploadImage = async (
  bucket: R2Bucket,
  cdnBase: string,
  file: File,
  keyPrefix = 'reports',
): Promise<{ url: string; key: string }> => {
  if (!file.type.startsWith('image/')) {
    throw new NotAnImageError(file.type);
  }
  const key = r2Key(file.name || 'upload.bin', keyPrefix);
  const body = await file.arrayBuffer();
  await putObject(bucket, key, body, file.type);
  return { url: cdnUrl(cdnBase, key), key };
};

// Contract documents (13 §1): pdf/word/image only. Returns the display
// metadata alongside the URL so the client commits it verbatim on
// POST /contracts (the file trio never re-derives client-side).
export const uploadContractFile = async (
  bucket: R2Bucket,
  cdnBase: string,
  file: File,
): Promise<{ url: string; key: string; name: string; mime: string; size: number }> => {
  if (!isContractFileMime(file.type)) {
    throw new UnsupportedContractFileError(file.type);
  }
  const name = file.name || 'upload.bin';
  const key = r2Key(name, 'contracts');
  const body = await file.arrayBuffer();
  await putObject(bucket, key, body, file.type);
  return { url: cdnUrl(cdnBase, key), key, name, mime: file.type, size: file.size };
};
