// Thrown when an uploaded contract file isn't pdf/word/image; the controller
// maps it to 415 unsupported_file_type (the message carries the content-type).
export class UnsupportedContractFileError extends Error {
  constructor(public readonly contentType: string) {
    super(`content-type ${contentType || 'unknown'} is not an accepted contract file`);
  }
}
