/**
 * lib/email/client.ts
 *
 * Resend SDK inicializace.
 * Import POUZE v server-side kontextu (Route Handlers, Server Components, cron jobs).
 */

import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  console.warn('[email/client] RESEND_API_KEY is not set – emails will fail');
}

export const resend = new Resend(process.env.RESEND_API_KEY || '');

/** Odesílatel – jeden centrální FROM pro všechny emaily */
export const EMAIL_FROM = `Objednávky chleba <${process.env.EMAIL_FROM || 'noreply@example.com'}>`;
