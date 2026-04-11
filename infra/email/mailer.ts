import nodemailer                    from 'nodemailer';
import { env }                       from '../../core/config/env';
import { createLogger }              from '../../core/utils/logger';

const log = createLogger('Mailer');

// ----------------------------------------------------------------
// createTransport
// Returns a Nodemailer transporter configured for the current
// environment. In development this points to Mailpit (localhost:1025)
// which captures all outgoing email without sending it.
// In production, replace with your real SMTP credentials.
// ----------------------------------------------------------------
function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Mailpit does not require auth or TLS in development.
    // Set secure: true and add auth credentials in production.
    secure: false,
    auth:   undefined,
  });
}

export interface SendEmailOptions {
  to:      string;
  subject: string;
  html:    string;
  text:    string;   // plain text fallback — always provide both
}

// ----------------------------------------------------------------
// sendEmail
// Sends a single email. Throws on failure so BullMQ can catch
// the error and trigger the retry policy.
// ----------------------------------------------------------------
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const transport = createTransport();

  log.info(
    { to: options.to, subject: options.subject },
    'Sending email'
  );

  const info = await transport.sendMail({
    from:    env.SMTP_FROM,
    to:      options.to,
    subject: options.subject,
    html:    options.html,
    text:    options.text,
  });

  log.info(
    { to: options.to, message_id: info.messageId },
    'Email sent successfully'
  );
}