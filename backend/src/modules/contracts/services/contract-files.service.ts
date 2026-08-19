import { putObject, r2Key } from '../../storage/services/storage.service';
import { resolveContractFileType } from '../constants/contract-file-types';
import { UnsupportedContractFileError } from '../http-errors/unsupported-contract-file.error';
import type { ContractFile } from '../types/contracts.types';

/** Store an uploaded contract document in the private `manttio-contracts`
 *  bucket and return the metadata the row carries (13 §1.2).
 *
 *  Unlike the `/upload/*` routes this is **not** a standalone endpoint: it is
 *  called from `POST /contracts` and `POST /contracts/:id/file`, both behind
 *  `requireRole`. That is deliberate — `/upload/*` sits behind bare auth, so a
 *  standalone contract-upload route would let any authenticated technician
 *  write into this bucket despite having no contract access at all.
 *
 *  No public URL is produced: the key stays server-side and downloads stream
 *  through `GET /contracts/:id/file`. */
export const storeContractFile = async (
  bucket: R2Bucket,
  file: File,
): Promise<ContractFile> => {
  const fileName = file.name || 'contrato.pdf';
  const fileType = resolveContractFileType(file.type, fileName);
  if (!fileType) throw new UnsupportedContractFileError(file.type);

  const key = r2Key(fileName, 'contracts');
  await putObject(bucket, key, await file.arrayBuffer(), file.type);
  return { fileKey: key, fileName, fileType, fileMime: file.type, fileSize: file.size };
};

/** Best-effort cleanup for an object whose row never committed. The upload
 *  happens before the insert (the transaction must not span an R2 write), so a
 *  failed create would otherwise leave an orphan. */
export const discardContractFile = async (bucket: R2Bucket, key: string): Promise<void> => {
  try {
    await bucket.delete(key);
  } catch {
    // An orphaned object is not worth failing the request the user already lost.
  }
};
