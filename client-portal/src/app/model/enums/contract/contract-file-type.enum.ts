/** The stored document's format (04 §4) — mirrors the backend
 *  `ContractFileType`. Not always a PDF: the UI downloads rather than
 *  promising a viewer it does not have. */
export enum ContractFileType {
  Pdf = 'pdf',
  Docx = 'docx',
  Odt = 'odt',
  Xls = 'xls',
  Xlsx = 'xlsx',
}
