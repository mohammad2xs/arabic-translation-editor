import type { UserRole } from '../dadmode/access';
import { createToken, generateShareUrl } from './production-storage';

interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  service: 'resend' | 'sendgrid' | 'nodemailer';
}

interface ShareEmailData {
  toEmail: string;
  role: UserRole;
  section?: string;
  expiryHours?: number;
  senderName?: string;
  message?: string;
  baseUrl?: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// Email service configuration
function getEmailConfig(): EmailConfig {
  const service = (process.env.EMAIL_SERVICE as 'resend' | 'sendgrid' | 'nodemailer') || 'resend';

  return {
    apiKey: process.env.EMAIL_SERVICE_API_KEY || '',
    fromEmail: process.env.FROM_EMAIL || 'noreply@arabicreview.app',
    fromName: process.env.FROM_NAME || 'Arabic Translation Review',
    service,
  };
}

// Generate email templates optimized for mobile
function generateEmailTemplate(
  shareUrl: string,
  role: UserRole,
  section?: string,
  senderName?: string,
  message?: string
): EmailTemplate {
  const roleDisplayNames = {
    admin: 'Administrator',
    reviewer: 'Reviewer',
    commenter: 'Commenter',
    viewer: 'Viewer'
  };

  const roleDisplay = roleDisplayNames[role] || 'Reviewer';
  const sectionDisplay = section ? ` for section "${section}"` : '';
  const customMessage = message ? `\n\n"${message}"\n` : '';
  const fromText = senderName ? ` from ${senderName}` : '';

  const subject = `Arabic Translation Review Invitation${sectionDisplay}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>Arabic Translation Review</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .email-container { background-color: #1a1a1a !important; color: #ffffff !important; }
      .email-card { background-color: #2a2a2a !important; border-color: #404040 !important; }
      .email-button { background-color: #2563eb !important; }
    }

    .email-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #ffffff;
      color: #333333;
      line-height: 1.6;
    }

    .email-card {
      background-color: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 12px;
      padding: 30px;
      margin: 20px 0;
    }

    .email-header {
      text-align: center;
      margin-bottom: 30px;
    }

    .email-title {
      font-size: 24px;
      font-weight: bold;
      margin: 0 0 10px 0;
      color: #2563eb;
    }

    .email-subtitle {
      font-size: 16px;
      color: #6b7280;
      margin: 0;
    }

    .email-content {
      margin: 25px 0;
    }

    .email-message {
      background-color: #e0f2fe;
      border-left: 4px solid #2563eb;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      font-style: italic;
    }

    .email-button {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      padding: 15px 30px;
      border-radius: 8px;
      font-weight: bold;
      text-align: center;
      font-size: 16px;
      margin: 20px 0;
      min-width: 200px;
      box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
    }

    .email-button:hover {
      background-color: #1d4ed8;
    }

    .email-instructions {
      background-color: #f0f9ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 20px;
      margin: 25px 0;
    }

    .email-instructions h3 {
      margin: 0 0 15px 0;
      color: #1e40af;
      font-size: 16px;
    }

    .email-instructions ul {
      margin: 0;
      padding-left: 20px;
    }

    .email-instructions li {
      margin: 8px 0;
    }

    .email-footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e9ecef;
      font-size: 14px;
      color: #6b7280;
    }

    .email-url {
      word-break: break-all;
      font-family: monospace;
      background-color: #f3f4f6;
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0;
      font-size: 14px;
    }

    @media only screen and (max-width: 480px) {
      .email-container {
        padding: 10px;
      }

      .email-card {
        padding: 20px;
      }

      .email-title {
        font-size: 20px;
      }

      .email-button {
        display: block;
        width: 100%;
        padding: 18px;
        font-size: 18px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-card">
      <div class="email-header">
        <h1 class="email-title">🔍 Arabic Translation Review</h1>
        <p class="email-subtitle">You've been invited to review Arabic translations</p>
      </div>

      <div class="email-content">
        <p>Hello!</p>

        <p>You've been invited${fromText} to review Arabic translations as a <strong>${roleDisplay}</strong>${sectionDisplay}.</p>

        ${customMessage ? `<div class="email-message">${message}</div>` : ''}

        <div style="text-align: center;">
          <a href="${shareUrl}" class="email-button">
            📱 Open on Mobile
          </a>
        </div>

        <div class="email-instructions">
          <h3>📱 For the best mobile experience:</h3>
          <ul>
            <li><strong>iPhone/iPad:</strong> Tap the link above, then tap the share button and "Add to Home Screen"</li>
            <li><strong>Android:</strong> Open in Chrome, tap the menu and "Add to Home screen"</li>
            <li><strong>Desktop:</strong> Works great in any modern browser</li>
          </ul>
        </div>

        <p><strong>Your access level:</strong> ${roleDisplay}</p>
        ${section ? `<p><strong>Section:</strong> ${section}</p>` : ''}

        <p>This link will expire in a few days for security. If you need extended access, please contact the person who shared this with you.</p>
      </div>

      <div class="email-footer">
        <p>If the button doesn't work, copy this link:</p>
        <div class="email-url">${shareUrl}</div>
        <p>This invitation was sent to ${shareUrl.includes('token=') ? 'you' : 'this email address'}. If you weren't expecting this, you can safely ignore this email.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `
Arabic Translation Review Invitation

You've been invited${fromText} to review Arabic translations as a ${roleDisplay}${sectionDisplay}.

${customMessage}

Access the review here: ${shareUrl}

For the best mobile experience:
- iPhone/iPad: Open the link, then tap share button and "Add to Home Screen"
- Android: Open in Chrome, tap menu and "Add to Home screen"
- Desktop: Works in any modern browser

Your access level: ${roleDisplay}
${section ? `Section: ${section}` : ''}

This link will expire in a few days for security. If you need extended access, please contact the person who shared this with you.

If you weren't expecting this invitation, you can safely ignore this email.
`;

  return { subject, html, text };
}

// Resend email service
async function sendWithResend(
  config: EmailConfig,
  to: string,
  template: EmailTemplate
): Promise<boolean> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${config.fromName} <${config.fromEmail}>`,
        to: [to],
        subject: template.subject,
        html: template.html,
        text: template.text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Email] Resend API error:', error);
      return false;
    }

    const result = await response.json();
    console.log('[Email] Sent successfully via Resend:', result.id);
    return true;
  } catch (error) {
    console.error('[Email] Resend error:', error);
    return false;
  }
}

// SendGrid email service
async function sendWithSendGrid(
  config: EmailConfig,
  to: string,
  template: EmailTemplate
): Promise<boolean> {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: config.fromEmail, name: config.fromName },
        subject: template.subject,
        content: [
          { type: 'text/plain', value: template.text },
          { type: 'text/html', value: template.html },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Email] SendGrid API error:', error);
      return false;
    }

    console.log('[Email] Sent successfully via SendGrid');
    return true;
  } catch (error) {
    console.error('[Email] SendGrid error:', error);
    return false;
  }
}

// Main email sending function
export async function sendShareEmail(data: ShareEmailData): Promise<{
  success: boolean;
  token?: string;
  shareUrl?: string;
  error?: string;
}> {
  try {
    const config = getEmailConfig();

    if (!config.apiKey) {
      return {
        success: false,
        error: 'Email service not configured. Please set EMAIL_SERVICE_API_KEY environment variable.',
      };
    }

    // Create token with expiry
    const expiryHours = data.expiryHours || 72; // Default 3 days
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    const token = await createToken(data.role, expiresAt, data.section);

    // Generate share URL - prefer request origin, then env, then fallback
    const baseUrl = data.baseUrl ||
                   process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                   process.env.NEXT_PUBLIC_APP_URL ||
                   'http://localhost:3000';
    const shareUrl = generateShareUrl(baseUrl, token, data.section, 'dad');

    // Generate email template
    const template = generateEmailTemplate(
      shareUrl,
      data.role,
      data.section,
      data.senderName,
      data.message
    );

    // Send email based on configured service
    let success = false;
    switch (config.service) {
      case 'resend':
        success = await sendWithResend(config, data.toEmail, template);
        break;
      case 'sendgrid':
        success = await sendWithSendGrid(config, data.toEmail, template);
        break;
      default:
        console.error('[Email] Unknown email service:', config.service);
        return { success: false, error: 'Unknown email service configured' };
    }

    if (success) {
      return { success: true, token, shareUrl };
    } else {
      return { success: false, error: 'Failed to send email' };
    }
  } catch (error) {
    console.error('[Email] Error sending share email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// Generate share link without sending email
export async function generateShareLink(
  role: UserRole,
  section?: string,
  expiryHours: number = 72,
  baseUrl?: string
): Promise<{
  success: boolean;
  token?: string;
  shareUrl?: string;
  error?: string;
}> {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    const token = await createToken(role, expiresAt, section);
    // Prefer request origin, then env variables, then fallback
    const resolvedBaseUrl = baseUrl ||
                           process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                           process.env.NEXT_PUBLIC_APP_URL ||
                           'http://localhost:3000';
    const shareUrl = generateShareUrl(resolvedBaseUrl, token, section, 'dad');

    return { success: true, token, shareUrl };
  } catch (error) {
    console.error('[Email] Error generating share link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate link',
    };
  }
}

// Validate email address
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Get email service status
export function getEmailServiceStatus(): {
  configured: boolean;
  service: string;
  hasApiKey: boolean;
} {
  const config = getEmailConfig();
  return {
    configured: !!config.apiKey,
    service: config.service,
    hasApiKey: !!config.apiKey,
  };
}