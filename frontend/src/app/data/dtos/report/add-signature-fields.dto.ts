export interface AddSignatureFields {
  signed_by: string;
  signature?: File;
  signature_base64?: string;
  signed_latitude: number;
  signed_longitude: number;
  signed_accuracy?: number | null;
}
