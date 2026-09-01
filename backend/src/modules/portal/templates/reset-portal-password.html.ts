/**
 * Password reset email template for portal users.
 * Receives escaped name, brand name, temp password, and portal login URL.
 */
export const resetPortalPasswordTemplate = (opts: {
  contactName: string;
  brandName: string;
  tempPassword: string;
  portalUrl: string;
}): string => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Restablecimiento de Contraseña</title>
</head>
<body>
  <h1>Restablecimiento de Contraseña</h1>
  <p>Hola ${opts.contactName},</p>
  <p>Se ha solicitado un restablecimiento de contraseña para tu cuenta en el Portal de Clientes de <strong>${opts.brandName}</strong>.</p>
  <h2>Tu contraseña temporal:</h2>
  <p>
    <code>${opts.tempPassword}</code>
  </p>
  <p><a href="${opts.portalUrl}">Acceder al Portal de Clientes</a></p>
  <p><strong>Por favor, cambia tu contraseña en tu próximo acceso.</strong></p>
  <hr>
  <p><em>Este es un mensaje automático. Por favor, no respondas a este correo.</em></p>
</body>
</html>`;

export const resetPortalPasswordText = (opts: {
  contactName: string;
  brandName: string;
  tempPassword: string;
  portalUrl: string;
}): string => `Restablecimiento de Contraseña

Hola ${opts.contactName},

Se ha solicitado un restablecimiento de contraseña para tu cuenta en el Portal de Clientes de ${opts.brandName}.

Contraseña temporal: ${opts.tempPassword}

Acceder: ${opts.portalUrl}

Por favor, cambia tu contraseña en tu próximo acceso.

---
Este es un mensaje automático. Por favor, no respondas a este correo.`;
