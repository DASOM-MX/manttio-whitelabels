const phone = import.meta.env.PUBLIC_CONTACT_PHONE ?? '+52 81 0000 0000';
const email = import.meta.env.PUBLIC_CONTACT_EMAIL ?? 'contacto@penanevadachillers.com';

export const contact = {
  phone,
  phoneHref: `tel:${phone.replace(/\s+/g, '')}`,
  email,
  emailHref: `mailto:${email}`,
};
