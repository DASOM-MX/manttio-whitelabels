// Output shape for a contact (plan 07 §1). Bare entity per the superadmin
// envelope; the customers detail response nests an array of these.
export interface ContactDto {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}
