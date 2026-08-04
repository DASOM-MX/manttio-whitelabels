/** The alphabet a visit code is made of (`V-YYYYMMDD-NNNN`). Mirrors the API's
 *  own validator, which rejects everything else — and does so for a reason worth
 *  restating here: the term reaches the database as a `LIKE '<term>%'` pattern,
 *  and `%` or `_` in it would turn "find this visit" into "return every visit
 *  ever", unpaginated.
 *
 *  Checking it in the search box too is not distrust of the backend. It is the
 *  difference between a message next to the field and a failed round trip that
 *  leaves the calendar looking broken. */
export const VISIT_CODE_PATTERN = /^[A-Za-z0-9-]+$/;
