// File types accepted for a filed contract document (13 §1): PDF, Word, or any
// image. Enforced at POST /upload/contract and re-checked by the contract
// validators so a JSON create/patch can't smuggle another type in.
export const CONTRACT_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const isContractFileMime = (mime: string): boolean =>
  mime.startsWith('image/') || (CONTRACT_DOCUMENT_MIME_TYPES as readonly string[]).includes(mime);
