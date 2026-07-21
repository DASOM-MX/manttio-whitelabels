import { CustomerSource } from '../../../data/dtos/customer';

/** Hand-pickable sources for the customer form (07). Share links feed the
 *  public lead endpoint across facebook/instagram/tiktok/whatsapp/webpage —
 *  facebook and website remain hand-pickable members; instagram/tiktok/
 *  whatsapp exist only via that UTM derivation, so they render in lists/stats
 *  but are never offered for manual pick. */
export const MANUAL_CUSTOMER_SOURCES: readonly CustomerSource[] = [
  CustomerSource.Facebook,
  CustomerSource.Google,
  CustomerSource.Referral,
  CustomerSource.Website,
  CustomerSource.Phonecall,
  CustomerSource.PersonalMeeting,
  CustomerSource.Other,
];
