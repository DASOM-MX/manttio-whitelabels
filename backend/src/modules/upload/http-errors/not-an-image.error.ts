// Thrown when the uploaded file's content-type isn't an image; the controller
// maps it to 415 not_an_image (the message carries the offending content-type).
export class NotAnImageError extends Error {
  constructor(public readonly contentType: string) {
    super(`content-type ${contentType} is not an image`);
  }
}
