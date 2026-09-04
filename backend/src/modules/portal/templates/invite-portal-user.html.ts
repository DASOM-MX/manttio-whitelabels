import type { PortalCredentialEmailParams } from '../types/portal-emails.types';

/**
 * Invite email template for new portal users.
 * Receives escaped name, brand name, temp password, and portal login URL.
 */
export const invitePortalUserTemplate = (opts: PortalCredentialEmailParams): string => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Acceso al Portal de Clientes</title>
</head>
<body>
  <h1>Te damos la bienvenida al Portal de Clientes</h1>
  <p>Hola ${opts.contactName},</p>
  <p>Se ha creado una cuenta en el Portal de Clientes de <strong>${opts.brandName}</strong> para que puedas acceder a tu información.</p>
  <h2>Tus credenciales temporales:</h2>
  <p>
    <strong>Contraseña temporal:</strong> <code>${opts.tempPassword}</code>
  </p>
  <p><a href="${opts.portalUrl}">Acceder al Portal de Clientes</a></p>
  <p><strong>Por favor, cambia tu contraseña en tu primer acceso.</strong></p>
  <hr>
  <p><em>Este es un mensaje automático. Por favor, no respondas a este correo.</em></p>
</body>
</html>`;

export const invitePortalUserText = (opts: PortalCredentialEmailParams): string => `Te damos la bienvenida al Portal de Clientes

Hola ${opts.contactName},

Se ha creado una cuenta en el Portal de Clientes de ${opts.brandName}.

Contraseña temporal: ${opts.tempPassword}

Acceder: ${opts.portalUrl}

Por favor, cambia tu contraseña en tu primer acceso.

---
Este es un mensaje automático. Por favor, no respondas a este correo.`;
