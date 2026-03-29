/**
 * lib/email/send.ts
 *
 * Email sending functions. Each function logs result to email_log table.
 * Email body: plain HTML strings with bread/gold color scheme.
 *
 * Functions:
 *   - sendOnboarding(user, orderUrl)
 *   - sendReminder(users, weekStart)
 *   - sendBakingEve(users, bakingDate, scheduledAt)
 *   - sendSummary(adminEmail, weekStart, orders)
 */

import { resend, EMAIL_FROM } from './client';
import { db } from '../db/client';
import { emailLogs } from '../db/schema';
import { formatDateCZ } from '../week/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailUser {
  id: string;
  name: string;
  email: string | null;
}

interface OrderSummaryItem {
  userName: string;
  productName: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Shared HTML styles
// ---------------------------------------------------------------------------

const htmlWrapper = (body: string) => `
<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#fdf7ed;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #f5ddb0;">
      ${body}
    </div>
    <p style="text-align:center;color:#965519;font-size:12px;margin-top:16px;">
      Objednávky chleba
    </p>
  </div>
</body>
</html>
`;

const heading = (text: string) =>
  `<h1 style="color:#7a4419;font-size:22px;margin:0 0 16px 0;">${text}</h1>`;

const button = (url: string, label: string) =>
  `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:#d4892a;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:16px;">${label}</a>
  </div>`;

// ---------------------------------------------------------------------------
// Log helper
// ---------------------------------------------------------------------------

async function logEmail(
  type: string,
  userId: string | null,
  weekStart: string | null,
  success: boolean,
  errorMsg: string | null = null,
): Promise<void> {
  try {
    await db.insert(emailLogs).values({
      type,
      userId,
      weekStart,
      success,
      errorMsg,
    });
  } catch (err) {
    console.error('[email/log] Failed to log email:', err);
  }
}

// ---------------------------------------------------------------------------
// sendOnboarding
// ---------------------------------------------------------------------------

export async function sendOnboarding(
  user: EmailUser,
  orderUrl: string,
): Promise<{ success: boolean; error?: string }> {
  if (!user.email) {
    return { success: false, error: 'Uživatel nemá nastavený email.' };
  }
  const html = htmlWrapper(`
    ${heading('Vítejte v systému objednávek!')}
    <p style="color:#643818;font-size:15px;line-height:1.6;">
      Dobrý den, <strong>${user.name}</strong>,<br><br>
      byl/a jste přidán/a do systému objednávek pečiva.
      Přes odkaz níže si můžete nastavit pravidelné objednávky.
    </p>
    ${button(orderUrl, 'Otevřít objednávku')}
    <p style="color:#965519;font-size:13px;line-height:1.5;">
      Tento odkaz je určen jen pro vás – nikomu ho nesdílejte.<br>
      Odkaz zůstane platný, dokud ho admin nezmění.
    </p>
  `);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Vítejte – vaše objednávka chleba',
      html,
    });

    const success = !result.error;
    await logEmail('ONBOARDING', user.id, null, success, result.error?.message);
    return success ? { success: true } : { success: false, error: result.error?.message };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[email/sendOnboarding] Error:', errorMsg);
    await logEmail('ONBOARDING', user.id, null, false, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// ---------------------------------------------------------------------------
// sendReminder
// ---------------------------------------------------------------------------

export async function sendReminder(
  users: EmailUser[],
  weekStart: string,
  orderBaseUrl: string,
): Promise<void> {
  const weekDate = new Date(weekStart + 'T00:00:00');
  const formattedWeek = formatDateCZ(weekDate);

  for (const user of users) {
    if (!user.email) continue;
    const html = htmlWrapper(`
      ${heading('Týdenní objednávka')}
      <p style="color:#643818;font-size:15px;line-height:1.6;">
        Dobrý den, <strong>${user.name}</strong>,<br><br>
        byl zahájen nový týden (${formattedWeek}).
        Zkontrolujte prosím svou objednávku a případně ji upravte.
      </p>
      ${button(orderBaseUrl, 'Zkontrolovat objednávku')}
      <p style="color:#965519;font-size:13px;">
        Objednávku můžete měnit až do uzávěrky.
      </p>
    `);

    try {
      const result = await resend.emails.send({
        from: EMAIL_FROM,
        to: user.email,
        subject: `Objednávka na týden ${formattedWeek}`,
        html,
      });

      const success = !result.error;
      await logEmail('REMINDER', user.id, weekStart, success, result.error?.message);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[email/sendReminder] Error for ${user.email}:`, errorMsg);
      await logEmail('REMINDER', user.id, weekStart, false, errorMsg);
    }
  }
}

// ---------------------------------------------------------------------------
// sendBakingEve
// ---------------------------------------------------------------------------

export async function sendBakingEve(
  users: EmailUser[],
  bakingDate: Date,
  scheduledAt: Date,
  orderBaseUrl: string,
): Promise<void> {
  const formattedBaking = formatDateCZ(bakingDate);

  for (const user of users) {
    if (!user.email) continue;
    const html = htmlWrapper(`
      ${heading('Zítra se peče!')}
      <p style="color:#643818;font-size:15px;line-height:1.6;">
        Dobrý den, <strong>${user.name}</strong>,<br><br>
        Zítra (<strong>${formattedBaking}</strong>) se bude péct.
        Pokud chcete svou objednávku ještě upravit, udělejte to teď.
      </p>
      ${button(orderBaseUrl, 'Zkontrolovat objednávku')}
      <p style="color:#965519;font-size:13px;">
        Po uzávěrce již nebude možné objednávku měnit.
      </p>
    `);

    try {
      // Use Resend scheduledAt parameter for delayed delivery
      // scheduledAt is supported by Resend API but not yet in SDK types (resend@3.x)
      type EmailOptsWithScheduled = Parameters<typeof resend.emails.send>[0] & { scheduledAt?: string };
      const result = await resend.emails.send({
        from: EMAIL_FROM,
        to: user.email,
        subject: `Připomínka – zítra se peče (${formattedBaking})`,
        html,
        scheduledAt: scheduledAt.toISOString(),
      } as EmailOptsWithScheduled);

      const success = !result.error;
      await logEmail('BAKING_EVE', user.id, null, success, result.error?.message);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[email/sendBakingEve] Error for ${user.email}:`, errorMsg);
      await logEmail('BAKING_EVE', user.id, null, false, errorMsg);
    }
  }
}

// ---------------------------------------------------------------------------
// sendSummary
// ---------------------------------------------------------------------------

export async function sendSummary(
  adminEmail: string,
  weekStart: string,
  orderItems: OrderSummaryItem[],
): Promise<void> {
  const weekDate = new Date(weekStart + 'T00:00:00');
  const formattedWeek = formatDateCZ(weekDate);

  // Group orders by product for summary
  const byProduct = new Map<string, { total: number; details: string[] }>();
  for (const item of orderItems) {
    if (item.quantity <= 0) continue;
    const existing = byProduct.get(item.productName) || { total: 0, details: [] };
    existing.total += item.quantity;
    existing.details.push(`${item.userName}: ${item.quantity}ks`);
    byProduct.set(item.productName, existing);
  }

  let tableRows = '';
  for (const [product, data] of byProduct) {
    tableRows += `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f5ddb0;color:#643818;font-weight:600;">${product}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f5ddb0;color:#d4892a;font-weight:700;text-align:center;">${data.total}ks</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f5ddb0;color:#965519;font-size:13px;">${data.details.join(', ')}</td>
      </tr>
    `;
  }

  const html = htmlWrapper(`
    ${heading(`Soupiska – ${formattedWeek}`)}
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#fdf8f0;">
          <th style="padding:8px 12px;text-align:left;color:#7a4419;font-size:13px;">Produkt</th>
          <th style="padding:8px 12px;text-align:center;color:#7a4419;font-size:13px;">Celkem</th>
          <th style="padding:8px 12px;text-align:left;color:#7a4419;font-size:13px;">Detail</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#965519;">Žádné objednávky pro tento týden.</td></tr>'}
      </tbody>
    </table>
    <p style="color:#965519;font-size:12px;margin-top:16px;">
      Celkem produktů: ${orderItems.filter(i => i.quantity > 0).length} položek od ${new Set(orderItems.filter(i => i.quantity > 0).map(i => i.userName)).size} zákazníků
    </p>
  `);

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: adminEmail,
      subject: `Soupiska objednávek – ${formattedWeek}`,
      html,
    });

    const success = !result.error;
    await logEmail('SUMMARY', null, weekStart, success, result.error?.message);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[email/sendSummary] Error:', errorMsg);
    await logEmail('SUMMARY', null, weekStart, false, errorMsg);
  }
}
