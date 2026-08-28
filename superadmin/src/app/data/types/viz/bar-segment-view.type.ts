/** A `segmented-bar` segment resolved for the template: share of the total in
 *  percent, its rule's fill class, and the printable count. Built in the
 *  component's computed so the template stays free of function calls. */
export interface BarSegmentView {
  id: string;
  label: string;
  valueText: string;
  ruleClass: string;
  widthPct: number;
}
