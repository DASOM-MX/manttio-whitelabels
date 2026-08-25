/** One entry of a `p-select` / `p-multiselect` options array. Cross-domain, so
 *  it sits at the root of `types/` rather than under a feature folder. */
export interface Option {
  label: string;
  value: string;
}
