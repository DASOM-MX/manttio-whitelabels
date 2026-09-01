// Markup for the password reset email. Markup only — display values arrive
// pre-formatted from ../helpers/portal-password-reset-email.helpers.ts, per
// the templates/-vs-helpers/ split.
//
// Table-based layout with inline styles because that is what email clients
// still parse: Outlook's Word renderer ignores flex/grid and most <style>
// blocks. Nothing here is shared with the app's CSS on purpose.

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

export const portalPasswordResetEmailHtml = (
  resetUrl: string,
  brandName: string | undefined,
  // Brand primary, pre-resolved to a hex by the helper. Never a literal here —
  // the CTA is the one coloured surface in this email and it is the tenant's.
  accent: string,
): string => {
  const displayBrandName = brandName || 'Portal';
  const escapedBrandName = escapeHtml(displayBrandName);
  const escapedUrl = escapeHtml(resetUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #333;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      color: #000;
    }
    .brand-name {
      display: block;
      margin-top: 8px;
      font-size: 14px;
      color: #666;
    }
    .content {
      margin-bottom: 30px;
    }
    .cta-button {
      display: inline-block;
      padding: 12px 24px;
      background-color: ${accent};
      color: #fff;
      text-decoration: none;
      border-radius: 4px;
      margin: 20px 0;
      font-weight: 500;
    }
    .cta-button:hover {
      background-color: #0052a3;
    }
    .reset-link {
      word-break: break-all;
      font-family: monospace;
      font-size: 12px;
      color: #666;
      margin: 15px 0;
      padding: 10px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }
    .footer {
      border-top: 1px solid #ddd;
      padding-top: 20px;
      font-size: 12px;
      color: #999;
    }
    .warning {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      padding: 12px;
      border-radius: 4px;
      margin: 15px 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Restablece tu contraseña</h1>
      <span class="brand-name">${escapedBrandName}</span>
    </div>

    <div class="content">
      <p>Hola,</p>

      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Usa el botón para elegir una nueva:</p>

      <a href="${escapedUrl}" class="cta-button">Restablecer contraseña</a>

      <p>O copia y pega este enlace en tu navegador:</p>
      <div class="reset-link">${escapedUrl}</div>

      <div class="warning">
        <strong>Este enlace vence en 1 hora.</strong> Si no solicitaste el cambio, puedes ignorar este correo: tu cuenta sigue protegida.
      </div>

      <p>¿Tienes dudas? Responde a este correo y te ayudamos.</p>
    </div>

    <div class="footer">
      <p>This is an automated message from ${escapedBrandName}. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
};
