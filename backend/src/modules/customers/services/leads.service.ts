import type { Db } from '../../database/client';
import { ClientType, CustomerSource, CustomerStatus } from '../enums/customers.enum';
import { CUSTOMER_SOURCE_LABELS } from '../constants/customer-source';
import { insertCustomerWithRelations } from '../repository/customers.repository';
import { notifyBestEffort } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notifications.enum';
import type { CustomerWithRelations } from '../types/customers.types';
import type { CreateLeadInput } from '../validators/public-leads.validator';

// `source` is derived server-side from utm_source (never client-supplied
// directly), so it is injection-proof by construction: either it matches an
// enum member or it falls back to Website.
const deriveSource = (utmSource?: string): CustomerSource => {
  const normalized = utmSource?.toLowerCase();
  if (!normalized) return CustomerSource.Website;
  const values = Object.values(CustomerSource) as string[];
  return values.includes(normalized) ? (normalized as CustomerSource) : CustomerSource.Website;
};

/** Timeline birth-entry body: says where the lead came from, composed like the
 *  status-change entries (labels · separator). An unmapped utm_source falls
 *  back to "Sitio web" as the source, so the raw value is kept in parens —
 *  otherwise the origin would be silently lost from the human-readable trail. */
const leadAuditBody = (input: CreateLeadInput, source: CustomerSource): string => {
  const unmapped = input.utmSource && input.utmSource.toLowerCase() !== source;
  const parts = [
    'Lead creado desde el sitio web',
    `Origen: ${CUSTOMER_SOURCE_LABELS[source]}${unmapped ? ` (utm: ${input.utmSource})` : ''}`,
  ];
  if (input.utmCampaign) parts.push(`Campaña: ${input.utmCampaign}`);
  return parts.join(' · ');
};

// The public lead insert is the ONLY write path for the attribution columns
// (write-once): every update path omits them via UpdateCustomerFields.
export const createLead = async (
  db: Db,
  input: CreateLeadInput,
): Promise<CustomerWithRelations> => {
  const contactName = `${input.firstName} ${input.lastName}`;
  const isBusiness = input.clientType === ClientType.Business && input.businessName;
  const source = deriveSource(input.utmSource);

  // customers.name is the display/commercial name; the person who filled the
  // form becomes the default contact row, mirrored to contactName/phone/email
  // like every other create path.
  const name = isBusiness ? String(input.businessName) : contactName;

  const customer = await insertCustomerWithRelations(
    db,
    {
      name,
      contactName,
      email: input.email,
      phone: input.phone,
      observation: input.comments,
      status: CustomerStatus.Lead,
      source,
      clientType: input.clientType,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      utmTerm: input.utmTerm,
      utmContent: input.utmContent,
      gclid: input.gclid,
      fbclid: input.fbclid,
      referrer: input.referrer,
      landingPage: input.landingPage,
    },
    [
      {
        name: contactName,
        role: null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        isDefault: true,
      },
    ],
    null,
    // Timeline birth entry like every authenticated create — but with no actor
    // (public endpoint), which is exactly what a null userId means (08 §2).
    { userId: null, body: leadAuditBody(input, source) },
  );
  // Owner awareness feed — no actor to exclude on the public path.
  await notifyBestEffort(db, {
    role: 'owner',
    type: NotificationType.ClientRegisteredFromWebsite,
    title: 'Nuevo cliente desde el sitio web',
    body: `${name} llegó por el formulario de contacto.`,
    data: { customerId: customer.id },
  });
  return customer;
};
