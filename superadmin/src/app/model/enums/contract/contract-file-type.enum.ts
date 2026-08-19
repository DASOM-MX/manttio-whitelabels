/** The stored document's format (13 §1.2) — parity with the backend
 *  `ContractFileType`. Images are deliberately absent: a photo of a contract is
 *  not the contract, and the backend rejects them with 415. */
export enum ContractFileType {
  Pdf = 'pdf',
  Docx = 'docx',
  Odt = 'odt',
  Xls = 'xls',
  Xlsx = 'xlsx',
}
