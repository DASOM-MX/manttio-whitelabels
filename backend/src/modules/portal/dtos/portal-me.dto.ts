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
  grants: string[];
  mustChangePassword: boolean;
}
