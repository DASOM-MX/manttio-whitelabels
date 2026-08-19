import { ContractFileType } from '../enums/contracts.enum';

// The server-side upload allowlist (13 §1.2): pdf / docx / odt / xls / xlsx.
// One map, so the stored `fileType` enum and the accepted mimes cannot drift —
// anything absent here is rejected 415 at write time.
//
// Images are deliberately **not** accepted: a contract is the signed document,
// and a photo of one is not it. (The superseded 2026-07-22 filing spec allowed
// any `image/*`; that was dropped with the document-artifact rework.)
export const CONTRACT_MIME_TO_FILE_TYPE: Readonly<Record<string, ContractFileType>> = {
  'application/pdf': ContractFileType.Pdf,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    ContractFileType.Docx,
  'application/vnd.oasis.opendocument.text': ContractFileType.Odt,
  'application/vnd.ms-excel': ContractFileType.Xls,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ContractFileType.Xlsx,
};

// Browsers and OSes are inconsistent about Office mime types, so fall back to
// the extension when the reported content-type isn't one we know. An upload is
// only rejected when *neither* signal resolves.
const EXTENSION_TO_FILE_TYPE: Readonly<Record<string, ContractFileType>> = {
  pdf: ContractFileType.Pdf,
  docx: ContractFileType.Docx,
  odt: ContractFileType.Odt,
  xls: ContractFileType.Xls,
  xlsx: ContractFileType.Xlsx,
};

/** Resolve an upload to its `ContractFileType`, or null if it isn't allowed. */
export const resolveContractFileType = (
  mime: string,
  fileName: string,
): ContractFileType | null => {
  const byMime = CONTRACT_MIME_TO_FILE_TYPE[mime.toLowerCase()];
  if (byMime) return byMime;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TO_FILE_TYPE[ext] ?? null;
};
