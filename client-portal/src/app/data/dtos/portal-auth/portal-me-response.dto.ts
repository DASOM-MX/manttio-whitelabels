import type { PortalGrant } from '../../../model/enums/portal-auth/portal-grants.enum';

export interface PortalMeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    isAdmin: boolean;
  };
  customer: {
    id: string;
    name: string;
  };
  grants: PortalGrant[];
  mustChangePassword: boolean;
}
