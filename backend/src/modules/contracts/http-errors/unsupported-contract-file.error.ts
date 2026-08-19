// Thrown when an uploaded contract document isn't one of pdf/docx/odt/xls/xlsx
// (13 §1.2); the controller maps it to 415 unsupported_file_type (the message
// carries the rejected content-type).
export class UnsupportedContractFileError extends Error {
  constructor(public readonly contentType: string) {
    super(`content-type ${contentType || 'unknown'} is not an accepted contract file`);
  }
}
