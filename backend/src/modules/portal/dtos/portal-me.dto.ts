import type { PortalGrant } from '../enums/portal-grants.enum';

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
